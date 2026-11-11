import type { LlmProvider, JsonValue } from "../../story-pipeline/src/core/contracts.js";
import type { CommitGeneratedAudioInput } from "../../story-pipeline/src/worker/store.js";
import { EdgeConfigurationError, enrichSceneEdge, type ChineseSegmenter } from "./enrich.js";
import type { Delivery, EdgeStore, Lease, OutboxItem, QueueBinding, Phase } from "./contracts.js";
import { StoreUnavailable } from "./store.js";
import { GlossValidationError, LlmProviderError, type GlossValidationDiagnostics } from "../../story-pipeline/src/providers/llm/errors.js";
import {advanceEnrichment} from './enrich-step.js';
import { initialPreparation, prepareScene, SEGMENTATION_VERSION } from './prepare.js';

export interface Services {
  store: EdgeStore; queue: QueueBinding; dictionaryVersion: string;
  segmentChinese: ChineseSegmenter;
  provider(): LlmProvider & { provider: string; model: string; promptVersion: string };
  preflight(lease: Lease): Promise<void>;
  incrementalDictionary?: boolean;
  asyncDictionary?: boolean;
  enrichmentStore?: EdgeStore;
  audio(lease: Lease): Promise<CommitGeneratedAudioInput>;
}
class DictionaryReadFailure extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function publish(item: OutboxItem, services: Services): Promise<void> {
  await services.queue.send({ jobId: item.jobId, ...(item.kind ? { kind: item.kind } : {}) });
  const store = item.kind === "enrichment" ? services.enrichmentStore : services.store;
  if (!store) throw new StoreUnavailable("Background enrichment storage is unavailable.");
  await store.published(item);
  for (const followup of item.followups ?? []) await publish(followup, services);
}
export async function tick(services: Services): Promise<void> {
  await services.store.recover();
  for (const item of await services.store.pending()) await publish(item, services);
  if (services.enrichmentStore) {
    await services.enrichmentStore.recover();
    for (const item of await services.enrichmentStore.pending()) await publish(item, services);
  }
}

export async function deliver(message: Delivery, services: Services): Promise<void> {
  const body = message.body as { jobId?: unknown; kind?: unknown } | null;
  if (!body || typeof body.jobId !== "string" || !UUID.test(body.jobId)) { message.ack(); return; }
  if (body.kind !== undefined && body.kind !== "enrichment") { message.ack(); return; }
  if (body.kind === "enrichment") {
    if (!services.enrichmentStore) { message.retry({ delaySeconds: 600 }); return; }
    services = { ...services, store: services.enrichmentStore };
  }
  let lease: Lease | undefined;
  let stageStarted:number|undefined;let outcome="interrupted";
  let glossDiagnostics: GlossValidationDiagnostics | undefined;
  try {
    const claim = await services.store.claim(body.jobId, crypto.randomUUID());
    if (claim.kind === "terminal" || claim.kind === "missing") { message.ack(); return; }
    if (claim.kind === "busy") { message.retry({ delaySeconds: Math.min(600, Math.max(5, claim.retryAfterSeconds)) }); return; }
    if (claim.kind !== "claimed") throw new StoreUnavailable("Invalid generation claim response.");
    lease = claim.lease;
    if (lease.ambiguous) {
      const next = await services.store.fail(lease, "upstream_outcome_unknown", false);
      if (next) await publish(next, services);
      message.ack(); return;
    }
    stageStarted=Date.now();
    await services.preflight(lease);
    const next = await execute(lease, services);
    if (next) await publish(next, services);
    message.ack();outcome="checkpointed";
  } catch (error) {
    outcome="retry_or_failure";
    if (error instanceof GlossValidationError) glossDiagnostics = error.diagnostics;
    if (!lease || error instanceof StoreUnavailable) {
      message.retry({ delaySeconds: 30 }); return;
    }
    // Invalid schema/config/invariants and uncertain paid requests are terminal.
    // A client timeout does not prove the upstream did not accept or charge it.
    try {
      const next = await services.store.fail(lease,
        error instanceof EdgeConfigurationError ? error.code :
          error instanceof GlossValidationError ? "generation_gloss_response_invalid" : "generation_stage_failed",
        (error instanceof LlmProviderError && error.safeToRetry) || (lease.enrichment === true && error instanceof DictionaryReadFailure));
      if (next) await publish(next, services);
      message.ack();
    } catch { message.retry({ delaySeconds: 30 }); }
  }finally{
    if(lease&&stageStarted!==undefined)console.log(JSON.stringify({event:"generation_stage_timing",kind:lease.enrichment?"enrichment":"generation",jobId:lease.job.jobId,phase:lease.phase,epoch:lease.epoch,startedAt:new Date(stageStarted).toISOString(),endedAt:new Date().toISOString(),durationMs:Date.now()-stageStarted,outcome,...(glossDiagnostics ? {glossDiagnostics} : {})}));
  }
}

async function execute(lease: Lease, s: Services): Promise<OutboxItem | null> {
  const { job, outputs, phase } = lease;
  if (phase === "audio") {
    await s.store.begin(lease);
    await s.store.commitAudio(lease, await s.audio(lease));
    return null;
  }
  const provider = s.provider();
  const fingerprint = { provider: provider.provider, model: provider.model,
    promptVersion: provider.promptVersion, dictionaryVersion: s.dictionaryVersion,
    ...(outputs.fingerprint?.segmentationVersion || (s.asyncDictionary && !outputs.fingerprint)
      ? { segmentationVersion: SEGMENTATION_VERSION } : {}) };
  if (outputs.fingerprint && Object.entries(fingerprint).some(([key,value]) => outputs.fingerprint![key as keyof typeof fingerprint] !== value))
    throw new EdgeConfigurationError("Generation configuration changed between checkpoints.");
  const checkpoint = (next: Phase, patch: Parameters<EdgeStore["checkpoint"]>[2]) => s.store.checkpoint(lease, next, patch);
  switch (phase) {
    case "plan": {
      await s.store.begin(lease);
      const plan = await provider.planStory({ premise: job.premise, targetLang: job.targetLanguage,
        learnerLevel: job.learnerLevel, setup: record(job.input.setup) });
      return checkpoint("write", { plan, fingerprint });
    }
    case "write": {
      const plan = outputs.plan ?? (job.jobType === "scene" ? {
        title: job.storyTitle ?? "Untitled story", worldBible: json(job.stateSnapshot.worldBible),
        characters: Array.isArray(job.stateSnapshot.characters) ? job.stateSnapshot.characters.map(json) : [],
        openingIntent: "Continue the selected branch while preserving the story state.",
      } : undefined);
      if (!plan) throw new EdgeConfigurationError("Planning checkpoint is missing.");
      await s.store.begin(lease);
      const scene = await provider.writeScene({ storyId: job.storyId, targetLang: job.targetLanguage,
        learnerLevel: job.learnerLevel, plan, state: { storyId: job.storyId, currentNodeId: job.nodeId,
          version: job.storyVersion, snapshot: json(job.stateSnapshot) }, selectedChoice: json(job.input.selectedChoice) });
      return checkpoint(fingerprint.segmentationVersion ? "prepare" : "enrich", { plan, scene, fingerprint,
        ...(fingerprint.segmentationVersion ? { preparation: initialPreparation() } : {}) });
    }
    case "prepare": {
      if (!outputs.scene) throw new EdgeConfigurationError("Writing checkpoint is missing.");
      const result = prepareScene({ text: outputs.scene.text, plotWords: outputs.scene.plotWords,
        choices: [], targetLang: job.targetLanguage, glossLang: job.targetLanguage === "zh" ? "en" : "zh" },
      s.segmentChinese, outputs.preparation);
      return result.initialTokens !== undefined
        ? checkpoint("commit", { initialTokens: result.initialTokens,
          ...(result.preparation ? { preparation: result.preparation } : {}) })
        : checkpoint("prepare", { preparation: result.preparation });
    }
    case "enrich": {
      if (!outputs.scene) throw new EdgeConfigurationError("Writing checkpoint is missing.");
      if(s.incrementalDictionary || lease.enrichment){
        const dictionary = lease.enrichment ? { async lookup(...args: Parameters<EdgeStore["lookup"]>) {
          try { return await s.store.lookup(...args); }
          catch (error) {
            if (error instanceof StoreUnavailable) throw new DictionaryReadFailure("Background dictionary read unavailable.");
            throw error;
          }
        } } : s.store;
        const result=await advanceEnrichment({text:outputs.scene.text,plotWords:outputs.scene.plotWords,choices:[],targetLang:job.targetLanguage,glossLang:job.targetLanguage==='zh'?'en':'zh'},dictionary,s.dictionaryVersion,s.segmentChinese,outputs.enrichmentProgress);
        return result.progress?checkpoint('enrich',{enrichmentProgress:result.progress}):checkpoint('gloss',{enriched:result.enriched!,enrichmentProgress:null});
      }
      const enriched = await enrichSceneEdge({ text: outputs.scene.text, plotWords: outputs.scene.plotWords,
        choices: [], targetLang: job.targetLanguage, glossLang: job.targetLanguage === "zh" ? "en" : "zh" },
      s.store, s.dictionaryVersion, s.segmentChinese);
      return checkpoint("gloss", { enriched });
    }
    case "gloss": {
      if (!outputs.scene || !outputs.enriched) throw new EdgeConfigurationError("Enrichment checkpoint is missing.");
      const enriched = structuredClone(outputs.enriched);
      if (enriched.unresolvedGlosses.length) {
        await s.store.begin(lease);
        const resolutions = await provider.resolveGlosses({ text: outputs.scene.text, targetLang: job.targetLanguage,
          glossLang: job.targetLanguage === "zh" ? "en" : "zh", tokens: enriched.tokens,
          unresolvedTokenIndexes: enriched.unresolvedGlosses.map(t => t.tokenIndex) });
        for (const resolution of resolutions) {
          const token = enriched.tokens[resolution.tokenIndex];
          if (token && token.tier !== "base") token.meaning = resolution.meaning.trim();
        }
      }
      if (enriched.tokens.some(t => t.tier !== "base" && !t.meaning?.trim())) throw new EdgeConfigurationError("Learner glosses are incomplete.", "generation_gloss_incomplete");
      return checkpoint("commit", { enriched });
    }
    case "commit": {
      if (!outputs.scene || (!outputs.enriched && !outputs.initialTokens) || !outputs.plan) throw new EdgeConfigurationError("Text checkpoints are incomplete.");
      return s.store.commitText(lease, { jobId: job.jobId, leaseOwner: lease.owner, title: outputs.plan.title,
        text: outputs.scene.text, textSegments: (outputs.enriched?.tokens ?? outputs.initialTokens!).map(token =>
          json(Object.fromEntries(Object.entries(token).filter(([key]) => key !== "candidates")))),
        choices: outputs.scene.choices.map(c => ({ label: c.label, intent: c.intent, branch_seed: c.branchSeed })),
        summary: outputs.scene.summary, stateSnapshot: {
          worldBible: outputs.plan.worldBible, characters: outputs.plan.characters,
          relationships: json(job.stateSnapshot.relationships ?? []),
          timelineSummary: [...(Array.isArray(job.stateSnapshot.timelineSummary) ? job.stateSnapshot.timelineSummary.map(json) : []), outputs.scene.summary],
          unresolvedThreads: outputs.scene.choices.map(c => c.intent), stateDelta: outputs.scene.stateDelta,
        }, promptVersion: provider.promptVersion, modelMetadata: { provider: provider.provider, model: provider.model,
          attempt: job.attempt, dictionaryVersion: s.dictionaryVersion }, ttsDeferred: job.ttsMode === "every_scene",
        ...(outputs.initialTokens && !lease.enrichment ? {
          enrichmentDeferred: true,
          enrichment: { plan: outputs.plan, scene: outputs.scene, fingerprint,
            enrichmentProgress: {
              version: s.dictionaryVersion,
              input: JSON.stringify({ text: outputs.scene.text, plotWords: outputs.scene.plotWords,
                choices: [], targetLang: job.targetLanguage, glossLang: job.targetLanguage === "zh" ? "en" : "zh" }),
              spans: outputs.preparation!.spans, prepareCursor: outputs.preparation!.cursor,
              resolved: [], entries: [], rendered: [], renderCursor: 0,
            } },
        } : {}) });
    }
    default: throw new EdgeConfigurationError("Unsupported generation phase.");
  }
}

function json(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(json);
  return value && typeof value === "object" ? record(value) : null;
}
function record(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k, json(v)])) : {};
}
