import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { enrichScene } from "../core/enrich-scene.js";
import type { JsonValue, StoryPlanInput, StoryState } from "../core/contracts.js";
import { ChatCompletionsProvider, LlmProviderError } from "../providers/llm/chat-completions.js";
import { SupabaseAudioStorage } from "../providers/storage/supabase.js";
import { getTtsProvider } from "../tts/index.js";
import { GenerationJobStore } from "./store.js";

export type RunJobResult = "completed" | "not_claimed" | "retry_scheduled" | "failed";

export async function runGenerationJob(jobId: string): Promise<RunJobResult> {
  const leaseOwner = `${hostname()}:${process.pid}:${randomUUID()}`;
  const store = GenerationJobStore.fromEnv();
  const job = await store.claim(jobId, leaseOwner);
  if (!job) return "not_claimed";

  try {
    if (job.jobType !== "opening" && job.jobType !== "scene") {
      throw new LlmProviderError("Job type is not implemented by this worker.", false);
    }
    if (job.stage === "text_completed_tts_pending") {
      return await synthesizeAndCommit(store, job, leaseOwner);
    }

    const provider = ChatCompletionsProvider.fromEnv();
    const setup = isRecord(job.input.setup) ? toJsonRecord(job.input.setup) : {};
    const plan = job.jobType === "opening"
      ? await provider.planStory({ premise: job.premise, targetLang: job.targetLanguage, learnerLevel: job.learnerLevel, setup } satisfies StoryPlanInput)
      : {
          title: job.storyTitle ?? "Untitled story",
          worldBible: toJsonValue(job.stateSnapshot.worldBible),
          characters: Array.isArray(job.stateSnapshot.characters) ? job.stateSnapshot.characters.map(toJsonValue) : [],
          openingIntent: "Continue from the selected branch while preserving the story state.",
        };
    const currentState: StoryState = {
      storyId: job.storyId,
      currentNodeId: job.nodeId,
      version: job.storyVersion,
      snapshot: toJsonValue(job.stateSnapshot),
    };
    const scene = await provider.writeScene({
      storyId: job.storyId,
      plan,
      state: currentState,
      selectedChoice: toJsonValue(job.input.selectedChoice),
    });
    const glossLang = job.targetLanguage === "zh" ? "en" : "zh";
    const enriched = enrichScene({
      text: scene.text,
      plotWords: scene.plotWords,
      choices: [],
      targetLang: job.targetLanguage,
      glossLang,
    });

    const resolutions = await provider.resolveGlosses({
      text: scene.text,
      targetLang: job.targetLanguage,
      glossLang,
      tokens: enriched.tokens,
      unresolvedTokenIndexes: enriched.unresolvedGlosses.map((item) => item.tokenIndex),
    });
    for (const resolution of resolutions) {
      const token = enriched.tokens[resolution.tokenIndex];
      if (token && token.tier !== "base") token.meaning = resolution.meaning;
    }

    const textSegments = enriched.tokens.map((token) =>
      Object.fromEntries(Object.entries(token).filter(([key]) => key !== "candidates")) as JsonValue
    );
    const committed = await store.commit({
      jobId,
      leaseOwner,
      title: plan.title,
      text: scene.text,
      textSegments,
      choices: scene.choices.map((choice) => ({
        label: choice.label,
        intent: choice.intent,
        branch_seed: choice.branchSeed,
      })),
      summary: scene.summary,
      stateSnapshot: {
        worldBible: plan.worldBible,
        characters: plan.characters,
        relationships: arrayJson(job.stateSnapshot.relationships),
        timelineSummary: [...arrayJson(job.stateSnapshot.timelineSummary), scene.summary],
        unresolvedThreads: scene.choices.map((choice) => choice.intent),
        stateDelta: scene.stateDelta,
      },
      promptVersion: provider.promptVersion,
      modelMetadata: { model: provider.model, attempt: job.attempt },
      ttsDeferred: job.ttsMode === "every_scene",
    });
    if (job.ttsMode === "every_scene") {
      return await synthesizeAndCommit(store, {
        ...job,
        stage: "text_completed_tts_pending",
        nodeId: committed.nodeId,
        nodeVersion: 1,
        nodeText: scene.text,
        textSegments,
      }, leaseOwner);
    }
    return "completed";
  } catch (error) {
    const retryable = error instanceof LlmProviderError ? error.retryable : true;
    const code = error instanceof LlmProviderError ? "llm_generation_failed" : "generation_worker_failed";
    const safeMessage = retryable
      ? "Story generation was interrupted and will be retried."
      : "This story request cannot be generated with the current configuration.";
    const status = await store.fail(jobId, leaseOwner, code, safeMessage, retryable);
    console.error("Generation job failed", { jobId, code, retryable, error });
    return status === "queued" ? "retry_scheduled" : "failed";
  }
}

async function synthesizeAndCommit(
  store: GenerationJobStore,
  job: import("./store.js").ClaimedGenerationJob,
  leaseOwner: string,
): Promise<RunJobResult> {
  try {
    if (!job.nodeId || !job.nodeText || !job.textSegments?.length) {
      throw new Error("TTS job is missing committed scene data.");
    }
    const tts = getTtsProvider(job.targetLanguage);
    if (!tts) throw new Error(`TTS provider is not configured for ${job.targetLanguage}.`);
    const words = job.textSegments.map((segment) => {
      if (typeof segment !== "object" || segment === null || Array.isArray(segment)) return "";
      return typeof segment.word === "string" ? segment.word : "";
    }).filter(Boolean);
    if (!words.length) throw new Error("TTS scene has no speakable tokens.");

    const result = await tts.synthesize(words, job.ttsVoiceId ?? undefined);
    if (result.timings.length !== words.length) throw new Error("TTS word timing count does not match the scene tokens.");
    const durationMs = Math.max(...result.timings.map((timing) => timing.end));
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("TTS provider returned an invalid duration.");

    const stored = await SupabaseAudioStorage.fromEnv().put({
      userId: job.userId,
      storyId: job.storyId,
      nodeId: job.nodeId,
      nodeVersion: job.nodeVersion ?? 1,
      audio: result.audio,
    });
    await store.commitAudio({
      jobId: job.jobId,
      leaseOwner,
      provider: tts.name,
      voiceId: job.ttsVoiceId,
      objectKey: stored.objectKey,
      contentHash: stored.contentHash,
      durationMs,
      timestamps: result.timings.map(({ start, end }) => ({ start, end })),
    });
    return "completed";
  } catch (error) {
    const retryable = !String(error).includes("not configured");
    const status = await store.failTts(
      job.jobId,
      leaseOwner,
      "tts_generation_failed",
      retryable ? "Narration was interrupted and will be retried." : "Narration is unavailable for this language.",
      retryable,
    );
    console.error("TTS generation failed", { jobId: job.jobId, retryable, error });
    return status === "queued" ? "retry_scheduled" : "completed";
  }
}

function arrayJson(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value.map(toJsonValue) : [];
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: Record<string, unknown>): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return toJsonRecord(value);
  return null;
}
