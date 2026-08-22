import type { JsonValue } from "../core/contracts.js";

export interface ClaimedGenerationJob {
  jobId: string;
  userId: string;
  storyId: string;
  nodeId: string | null;
  reservationId: string;
  jobType: "opening" | "scene" | "reroll" | "rewrite" | "tts_scene";
  stage: string;
  attempt: number;
  input: Record<string, unknown>;
  targetLanguage: "zh" | "en";
  learnerLevel: string;
  premise: string;
  storyTitle: string | null;
  ttsMode: "off" | "every_scene";
  ttsVoiceId: string | null;
  storyVersion: number;
  nodeVersion: number | null;
  nodeText: string | null;
  textSegments: JsonValue[] | null;
  stateSnapshot: Record<string, unknown>;
}

export interface CommitGeneratedTextInput {
  jobId: string;
  leaseOwner: string;
  title: string;
  text: string;
  textSegments: JsonValue[];
  choices: JsonValue[];
  summary: string;
  stateSnapshot: JsonValue;
  promptVersion: string;
  modelMetadata: JsonValue;
  ttsDeferred: boolean;
}

export interface CommitGeneratedAudioInput {
  jobId: string;
  leaseOwner: string;
  provider: string;
  voiceId: string | null;
  objectKey: string;
  contentHash: string;
  durationMs: number;
  timestamps: JsonValue[];
}

export class GenerationJobStore {
  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
  ) {}

  static fromEnv() {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase worker environment variables are not configured.");
    return new GenerationJobStore(url, key);
  }

  claim(jobId: string, leaseOwner: string) {
    return this.rpc<ClaimedGenerationJob | null>("claim_generation_job", {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_lease_seconds: 600,
    });
  }

  commit(input: CommitGeneratedTextInput) {
    return this.rpc<{ storyId: string; nodeId: string; status: string }>("commit_generated_story_text", {
      p_job_id: input.jobId,
      p_lease_owner: input.leaseOwner,
      p_title: input.title,
      p_text: input.text,
      p_text_segments: input.textSegments,
      p_choices: input.choices,
      p_summary: input.summary,
      p_state_snapshot: input.stateSnapshot,
      p_prompt_version: input.promptVersion,
      p_model_metadata: input.modelMetadata,
      p_tts_deferred: input.ttsDeferred,
    });
  }

  commitAudio(input: CommitGeneratedAudioInput) {
    return this.rpc<{ storyId: string; nodeId: string; audioId: string }>("commit_generated_story_audio", {
      p_job_id: input.jobId,
      p_lease_owner: input.leaseOwner,
      p_provider: input.provider,
      p_voice_id: input.voiceId ?? "",
      p_object_key: input.objectKey,
      p_content_hash: input.contentHash,
      p_duration_ms: input.durationMs,
      p_timestamps: input.timestamps,
    });
  }

  failTts(jobId: string, leaseOwner: string, code: string, safeMessage: string, retryable: boolean) {
    return this.rpc<"queued" | "partial_success" | "completed">("record_generated_story_tts_failure", {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_error_code: code,
      p_error_message_safe: safeMessage,
      p_retryable: retryable,
    });
  }

  fail(jobId: string, leaseOwner: string, code: string, safeMessage: string, retryable: boolean) {
    return this.rpc<"queued" | "failed" | "completed" | "partial_success">("record_generation_job_failure", {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_error_code: code,
      p_error_message_safe: safeMessage,
      p_retryable: retryable,
    });
  }

  private async rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase RPC ${name} failed (${response.status}): ${error.slice(0, 500)}`);
    }
    return await response.json() as T;
  }
}
