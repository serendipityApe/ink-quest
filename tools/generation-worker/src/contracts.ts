import type { ClaimedGenerationJob, CommitGeneratedTextInput, CommitGeneratedAudioInput } from "../../story-pipeline/src/worker/store.js";
import type { StoryPlan, SceneDraft } from "../../story-pipeline/src/core/contracts.js";
import type { EnrichSceneResult } from "../../story-pipeline/src/core/enrich-scene.js";
import type { DictionaryReader } from "./enrich.js";

export type Phase = "plan" | "write" | "enrich" | "gloss" | "commit" | "audio";
export interface Outputs {
  plan?: StoryPlan; scene?: SceneDraft; enriched?: EnrichSceneResult & { dictionaryVersion: string };
  fingerprint?: { provider: string; model: string; promptVersion: string; dictionaryVersion: string };
}
export interface Lease {
  job: ClaimedGenerationJob; owner: string; epoch: number; phase: Phase;
  outputs: Outputs; ambiguous: boolean;
}
export type Claim = { kind: "claimed"; lease: Lease } | { kind: "busy"; retryAfterSeconds: number } | { kind: "terminal" | "missing" };
export interface OutboxItem { jobId: string; revision: number; }
export interface EdgeStore extends DictionaryReader {
  claim(jobId: string, owner: string): Promise<Claim>;
  begin(lease: Lease): Promise<void>;
  checkpoint(lease: Lease, next: Phase, patch: Outputs): Promise<OutboxItem>;
  commitText(lease: Lease, input: CommitGeneratedTextInput): Promise<OutboxItem | null>;
  commitAudio(lease: Lease, input: CommitGeneratedAudioInput): Promise<void>;
  fail(lease: Lease, code: string, retryable: boolean): Promise<OutboxItem | null>;
  pending(): Promise<OutboxItem[]>;
  published(item: OutboxItem): Promise<void>;
  recover(): Promise<void>;
}
export interface QueueBinding { send(body: { jobId: string }): Promise<void>; }
export interface Delivery { body: unknown; ack(): void; retry(options: { delaySeconds: number }): void; }
