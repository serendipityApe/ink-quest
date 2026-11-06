import type { Claim, EdgeStore, Lease, OutboxItem, Outputs, Phase } from "./contracts.js";
import type { DictionaryBatch } from "./enrich.js";
import type { CommitGeneratedTextInput, CommitGeneratedAudioInput } from "../../story-pipeline/src/worker/store.js";

export class StoreUnavailable extends Error {}
const VOID_RPCS = new Set(["edge_begin_generation_stage", "edge_recover_generation_jobs",
  "edge_mark_generation_published", "edge_commit_generated_audio", "edge_report_generation_readiness"]);
export class SupabaseEdgeStore implements EdgeStore {
  constructor(private readonly url: string, private readonly key: string) {
    if (!url || !key || !url.startsWith("https://")) throw new Error("Generation storage is not configured.");
  }
  private fence(lease: Lease) {
    return { p_job_id: lease.job.jobId, p_owner: lease.owner, p_epoch: lease.epoch };
  }
  claim(jobId: string, owner: string) { return this.rpc<Claim>("edge_claim_generation_job", { p_job_id: jobId, p_owner: owner }); }
  begin(lease: Lease) { return this.rpc<void>("edge_begin_generation_stage", this.fence(lease)); }
  checkpoint(lease: Lease, next: Phase, patch: Outputs) {
    return this.rpc<OutboxItem>("edge_checkpoint_generation_stage", { ...this.fence(lease), p_next: next, p_output: patch });
  }
  commitText(lease: Lease, input: CommitGeneratedTextInput) {
    return this.rpc<OutboxItem | null>("edge_commit_generated_text", { ...this.fence(lease), p_input: input });
  }
  commitAudio(lease: Lease, input: CommitGeneratedAudioInput) {
    return this.rpc<void>("edge_commit_generated_audio", { ...this.fence(lease), p_input: input });
  }
  fail(lease: Lease, code: string, retryable: boolean) {
    return this.rpc<OutboxItem | null>("edge_fail_generation_stage", { ...this.fence(lease), p_code: code, p_retryable: retryable });
  }
  pending() { return this.rpc<OutboxItem[]>("edge_pending_generation_jobs", {}); }
  published(item: OutboxItem) { return this.rpc<void>("edge_mark_generation_published", { p_job_id: item.jobId, p_revision: item.revision }); }
  recover() { return this.rpc<void>("edge_recover_generation_jobs", {}); }
  reportReadiness(version: string, capabilities: Record<string, boolean>) {
    return this.rpc<void>("edge_report_generation_readiness", { p_dictionary_version: version, p_capabilities: capabilities });
  }
  lookup(language: "zh" | "en", words: string[], version: string) {
    return this.rpc<DictionaryBatch>("lookup_generation_dictionary", { p_language: language, p_words: words, p_version: version });
  }
  async ready(language: "zh" | "en", version: string) {
    const batch = await this.lookup(language, [], version);
    if (!batch.ready || batch.version !== version) throw new Error("Dictionary version is not ready.");
  }
  private async rpc<T>(name: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new StoreUnavailable(`Generation database request failed (${response.status}).`);
      if (VOID_RPCS.has(name)) {
        // PostgREST returns 204 with no body for SQL void. It is not JSON null.
        await response.body?.cancel();
        return undefined as T;
      }
      if (response.status === 204) throw new StoreUnavailable("Generation database result was empty.");
      return await response.json() as T;
    } catch {
      // Do not treat an unknown transaction outcome as an authoritative failure.
      // Redelivery reads the database before deciding what to do next.
      throw new StoreUnavailable("Generation database response was unavailable.");
    }
  }
}
