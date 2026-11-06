import assert from "node:assert/strict";
import test from "node:test";
import type { ClaimedGenerationJob, CommitGeneratedTextInput } from "../src/worker/store.js";
import { GenerationJobStore } from "../src/worker/store.js";
import { runGenerationJob } from "../src/worker/run-job.js";

for (const provider of ["openai", "gemini"]) {
  for (const jobType of ["opening", "scene"] as const) {
    test(`${provider} ${jobType} worker claims, enriches, resolves glosses and commits metadata (all I/O mocked)`, async (t) => {
      const keys = ["LLM_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "LLM_API_KEY", "LLM_MODEL", "LLM_CHAT_COMPLETIONS_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID", "OPENAI_MAX_OUTPUT_TOKENS", "LLM_PROMPT_VERSION", "OPENAI_REASONING_EFFORT"];
      const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
      Object.assign(process.env, {
        LLM_PROVIDER: provider, OPENAI_REASONING_EFFORT: "", OPENAI_ORG_ID: "", OPENAI_PROJECT_ID: "", OPENAI_MAX_OUTPUT_TOKENS: "6000", LLM_PROMPT_VERSION: "test-v1", OPENAI_API_KEY: "test-openai", OPENAI_MODEL: "test-openai-model",
        LLM_API_KEY: "test-gemini", LLM_MODEL: "test-gemini-model", LLM_CHAT_COMPLETIONS_URL: "https://gemini.invalid/chat/completions",
      });
      t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
      const job: ClaimedGenerationJob = {
        jobId: "test-job", userId: "test-user", storyId: "test-story", nodeId: jobType === "scene" ? "parent-node" : null,
        reservationId: "test-reservation", jobType, stage: "claimed", attempt: 1, input: { selectedChoice: { label: "Open the door" } },
        targetLanguage: "en", learnerLevel: "B1", premise: "A mysterious library", storyTitle: "The Library", ttsMode: "off",
        ttsVoiceId: null, storyVersion: 1, nodeVersion: null, nodeText: null, textSegments: null,
        stateSnapshot: { worldBible: { location: "library" }, characters: ["Mia"] },
      };
      const store = new GenerationJobStore("https://supabase.invalid", "test-service");
      t.mock.method(GenerationJobStore, "fromEnv", () => store);
      const claim = t.mock.method(store, "claim", async () => job);
      let committed: CommitGeneratedTextInput | undefined;
      const commit = t.mock.method(store, "commit", async (input: CommitGeneratedTextInput) => {
        committed = input;
        return { storyId: job.storyId, nodeId: "new-node", status: "completed" };
      });
      const fail = t.mock.method(store, "fail", async () => { throw new Error("unexpected failure"); });
      const tasks: string[] = [];
      let glossIndexes: number[] = [];
      t.mock.method(globalThis, "fetch", async (url: string | URL | Request, request: RequestInit = {}) => {
        assert.equal(String(url), provider === "openai" ? "https://api.openai.com/v1/responses" : "https://gemini.invalid/chat/completions");
        const body = JSON.parse(String(request.body));
        const payload = JSON.parse(provider === "openai" ? body.input : body.messages[1].content);
        tasks.push(payload.task);
        let result: unknown;
        if (payload.task.startsWith("Plan")) result = { title: "The Library", worldBible: { location: "library" }, characters: ["Mia"], openingIntent: "Enter" };
        else if (payload.task.startsWith("Write")) {
          assert.equal(payload.input.targetLang, job.targetLanguage);
          assert.equal(payload.input.learnerLevel, job.learnerLevel);
          result = {
          text: "Mia opens the library door. A mysterious letter waits beside a silver key on the wooden desk.",
          summary: "Mia finds a letter.", plotWords: ["letter"],
          choices: ["Read", "Listen", "Leave"].map((label) => ({ label, intent: label, branchSeed: {} })), stateDelta: { discovered: true },
        };
        }
        else if (payload.task.startsWith("Resolve")) {
          glossIndexes = payload.input.unresolvedTokenIndexes;
          result = { resolutions: glossIndexes.map((tokenIndex: number) => ({ tokenIndex, meaning: "测试释义" })) };
        }
        else throw new Error("unexpected task");
        return Response.json(provider === "openai"
          ? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] }
          : { choices: [{ message: { content: JSON.stringify(result) } }] });
      });
      assert.equal(await runGenerationJob(job.jobId), "completed");
      assert.equal(claim.mock.callCount(), 1);
      assert.equal(commit.mock.callCount(), 1);
      assert.equal(fail.mock.callCount(), 0);
      assert.ok(committed);
      assert.deepEqual(committed.modelMetadata, { provider, model: `test-${provider}-model`, attempt: 1 });
      assert.equal(committed.choices.length, 3);
      assert.equal(committed.ttsDeferred, false);
      const segments = committed.textSegments as Array<{ word: string; tier: string; meaning: string | null; candidates?: unknown }>;
      assert.ok(segments.length > 10);
      assert.ok(segments.some((segment) => segment.word === "letter" && segment.tier === "key" && typeof segment.meaning === "string" && segment.meaning.length > 0));
      assert.ok(segments.every((segment) => !("candidates" in segment)));
      for (const index of glossIndexes) assert.equal(segments[index].meaning, "测试释义");
      // Optional local dictionaries can resolve every token without an LLM gloss call.
      assert.equal(tasks.length, (jobType === "opening" ? 2 : 1) + (glossIndexes.length ? 1 : 0));
    });
  }
}
