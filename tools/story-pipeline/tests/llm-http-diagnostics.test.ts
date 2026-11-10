import assert from "node:assert/strict";
import test from "node:test";
import { createLlmProvider, LlmProviderError } from "../src/providers/llm/index.js";
import { safeLlmHttpDiagnostics } from "../src/providers/llm/errors.js";

const env = {
  LLM_PROVIDER: "openai", OPENAI_API_KEY: "offline-fixture",
  OPENAI_MODEL: "test-openai-model", LLM_REQUEST_ATTEMPTS: "3",
};
const planInput = { premise: "A library door opens.", targetLang: "en", learnerLevel: "B1", setup: {} };
const plan = { title: "The Library", worldBible: {}, characters: [], openingIntent: "Enter" };
const scene = {
  text: "Mia opens the library door and discovers a mysterious letter beside a silver key.",
  summary: "A letter appears.", plotWords: ["letter"],
  choices: ["Read", "Wait", "Leave"].map(label => ({ label, intent: label, branchSeed: {} })),
  stateDelta: {},
};
const glossInput = {
  text: scene.text, targetLang: "en", glossLang: "zh", unresolvedTokenIndexes: [0],
  tokens: [{ word: "letter", reading: null, level: null, tier: "key" as const, candidates: [], meaning: null }],
};
const jsonModeMessage =
  "Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'.";

test("every OpenAI stage explicitly requests JSON inside input, independent of story data", async t => {
  const stages: string[] = [];
  const fetch = t.mock.method(globalThis, "fetch", async (_url, request) => {
    const body = JSON.parse(String(request?.body));
    assert.match(body.input, /JSON/);
    assert.match(body.instructions, /JSON/);
    assert.equal(body.store, false);
    assert.deepEqual(body.text.format, { type: "json_object" });
    const payload = JSON.parse(body.input);
    stages.push(payload.task);
    const result = payload.task.startsWith("Plan") ? plan :
      payload.task.startsWith("Write") ? scene : { resolutions: [{ tokenIndex: 0, meaning: "信" }] };
    return Response.json({ status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] },
    ] });
  });
  const provider = createLlmProvider(env);
  assert.deepEqual(await provider.planStory(planInput), plan);
  assert.deepEqual(await provider.writeScene({
    storyId: "fixture", plan, state: { storyId: "fixture", currentNodeId: null, version: 1, snapshot: {} },
  }), scene);
  assert.deepEqual(await provider.resolveGlosses(glossInput), [{ tokenIndex: 0, meaning: "信" }]);
  assert.deepEqual(await provider.resolveGlosses({ ...glossInput, unresolvedTokenIndexes: [] }), []);
  assert.equal(stages.length, 3);
  assert.equal(fetch.mock.callCount(), 3);
});

test("known JSON-mode validation becomes fixed diagnostics without retry or raw response", async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "log", (...args: unknown[]) => { logs.push(args); });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    error: { code: null, type: "invalid_request_error", param: "input", message: jsonModeMessage },
    private_context: "never-log-private-context",
  }, { status: 400 }));
  const expected = {
    status: 400, code: null, type: "invalid_request_error", param: "input", category: "json_mode_input_missing",
  };
  await assert.rejects(createLlmProvider({ ...env, LLM_USAGE_TELEMETRY: "true" }).resolveGlosses(glossInput),
    (error: unknown) => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.retryable, false);
      assert.equal(error.safeToRetry, false);
      assert.deepEqual(error.httpDiagnostics, expected);
      assert.equal(error.message, "LLM request failed with status 400.");
      assert.doesNotMatch(JSON.stringify(error), /never-log|Response input messages/);
      return true;
    });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(logs.length, 1);
  const telemetry = JSON.parse(String(logs[0][0]));
  assert.equal(telemetry.httpStatus, 400);
  assert.equal(telemetry.failureKind, "http_error");
  assert.deepEqual(telemetry.httpDiagnostics, expected);
  assert.equal(telemetry.inputTokens, null);
  assert.doesNotMatch(JSON.stringify(logs), /never-log|Response input messages|offline-fixture/);
});

test("arbitrary upstream values never enter diagnostics or telemetry", async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "log", (...args: unknown[]) => { logs.push(args); });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    error: {
      code: "secret_key_like_identifier", type: "private_prompt", param: "customer_identifier",
      message: "private upstream story and credential json input",
    },
  }, { status: 400 }));
  await assert.rejects(createLlmProvider({ ...env, LLM_USAGE_TELEMETRY: "true" }).resolveGlosses(glossInput),
    (error: unknown) => {
      assert.ok(error instanceof LlmProviderError);
      assert.deepEqual(error.httpDiagnostics, {
        status: 400, code: "unknown", type: "unknown", param: "unknown", category: "other_http_error",
      });
      return true;
    });
  assert.equal(fetch.mock.callCount(), 1);
  assert.doesNotMatch(JSON.stringify(logs), /secret_key|private_prompt|customer_identifier|upstream story|credential/);
});

test("only exact allowlisted fields and the complete validation shape are retained", () => {
  const body = { error: {
    code: "context_length_exceeded", type: "invalid_request_error", param: "input", message: "private prompt",
  } };
  assert.deepEqual(safeLlmHttpDiagnostics(400, body), {
    status: 400, code: "context_length_exceeded", type: "invalid_request_error", param: "input",
    category: "other_http_error",
  });
  for (const [status, param, message] of [
    [500, "input", jsonModeMessage],
    [400, "model", jsonModeMessage],
    [400, "input", jsonModeMessage + " private suffix"],
    [400, "input", "JSON input rejected"],
  ] as const) {
    assert.equal(safeLlmHttpDiagnostics(status, { error: { param, message } }).category, "other_http_error");
  }
  for (const body of [null, [], "private text", { error: [] }, { error: "private text" }]) {
    assert.deepEqual(safeLlmHttpDiagnostics(400, body), {
      status: 400, code: null, type: null, param: null, category: "other_http_error",
    });
  }
});

test("safe diagnostics do not enable telemetry when it is disabled", async t => {
  const log = t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: { type: "invalid_request_error", param: "input", message: jsonModeMessage },
  }, { status: 400 }));
  await assert.rejects(createLlmProvider(env).resolveGlosses(glossInput));
  assert.equal(log.mock.callCount(), 0);
});
