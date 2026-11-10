import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createLlmProvider, LlmProviderError } from "../src/providers/llm/index.js";
import type { StoryPlanInput, SceneGenerationInput, GlossResolutionInput } from "../src/core/contracts.js";

const legacy = {
  LLM_CHAT_COMPLETIONS_URL: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  LLM_API_KEY: "test-gemini-only",
  LLM_MODEL: "test-gemini-model",
};
const openai = {
  LLM_PROVIDER: "openai",
  OPENAI_API_KEY: "test-openai-only",
  OPENAI_MODEL: "test-openai-model",
};
const planInput: StoryPlanInput = { premise: "A library door opens.", targetLang: "en", learnerLevel: "B1", setup: {} };
const plan = { title: "The Library", worldBible: { location: "library" }, characters: ["Mia"], openingIntent: "Open the door" };
const sceneInput: SceneGenerationInput = {
  storyId: "test-story", plan, state: { storyId: "test-story", currentNodeId: null, version: 1, snapshot: {} },
};
const scene = {
  text: "Mia opens the library door. An unfamiliar letter waits on the desk beside a tiny silver key.",
  summary: "Mia finds a letter.", plotWords: ["letter"],
  choices: ["Read the letter", "Take the key", "Call the librarian"].map((label) => ({ label, intent: label, branchSeed: {} })),
  stateDelta: { foundLetter: true },
};
const glossInput: GlossResolutionInput = {
  text: scene.text, targetLang: "en", glossLang: "zh", unresolvedTokenIndexes: [0],
  tokens: [{ word: "letter", reading: null, level: null, tier: "key", candidates: [], meaning: null }],
};
function responses(value: unknown) {
  return { status: "completed", output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(value) }] },
  ] };
}
function mockFetch(t: TestContext, handler: (url: string, request: RequestInit) => unknown) {
  return t.mock.method(globalThis, "fetch", async (url: string | URL | Request, request: RequestInit = {}) => {
    const value = handler(String(url), request);
    return value instanceof Response ? value : Response.json(value);
  });
}
const isProviderError = (retryable: boolean) => (error: unknown) => error instanceof LlmProviderError && error.retryable === retryable;

test("existing Gemini configuration remains the default even with an OpenAI key present", async (t) => {
  const fetch = mockFetch(t, (url, request) => {
    assert.equal(url, legacy.LLM_CHAT_COMPLETIONS_URL);
    assert.equal(new Headers(request.headers).get("Authorization"), `Bearer ${legacy.LLM_API_KEY}`);
    const body = JSON.parse(String(request.body));
    assert.equal(body.model, legacy.LLM_MODEL);
    assert.deepEqual(body.response_format, { type: "json_object" });
    return { choices: [{ message: { content: "```json\n" + JSON.stringify(plan) + "\n```" } }] };
  });
  const provider = createLlmProvider({ ...legacy, ...openai, LLM_PROVIDER: "" });
  assert.equal(provider.provider, "chat-completions");
  assert.deepEqual(await provider.planStory(planInput), plan);
  assert.equal(fetch.mock.callCount(), 1);
});

test("explicit Gemini rollback uses only the retained Gemini config", async (t) => {
  mockFetch(t, (url, request) => {
    assert.equal(url, legacy.LLM_CHAT_COMPLETIONS_URL);
    assert.equal(new Headers(request.headers).get("OpenAI-Organization"), null);
    return { choices: [{ message: { content: JSON.stringify(scene) } }] };
  });
  const provider = createLlmProvider({ ...legacy, ...openai, LLM_PROVIDER: "gemini" });
  assert.equal(provider.provider, "gemini");
  assert.deepEqual(await provider.writeScene(sceneInput), scene);
});

test("OpenAI uses Responses, isolated credentials, configured model, organization/project and no storage", async (t) => {
  mockFetch(t, (url, request) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(request.method, "POST");
    assert.equal(request.redirect, "manual");
    assert.ok(request.signal instanceof AbortSignal);
    const headers = new Headers(request.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${openai.OPENAI_API_KEY}`);
    assert.equal(headers.get("OpenAI-Organization"), "org-test");
    assert.equal(headers.get("OpenAI-Project"), "proj-test");
    const body = JSON.parse(String(request.body));
    assert.equal(body.model, openai.OPENAI_MODEL);
    assert.equal(body.max_output_tokens, 7500);
    assert.equal(body.store, false);
    assert.deepEqual(body.text, { format: { type: "json_object" } });
    assert.match(body.instructions, /JSON/);
    assert.deepEqual(JSON.parse(body.input).input, planInput);
    assert.equal(body.temperature, undefined);
    assert.equal(body.messages, undefined);
    return responses(plan);
  });
  const provider = createLlmProvider({ ...legacy, ...openai, OPENAI_ORG_ID: " org-test ", OPENAI_PROJECT_ID: "proj-test", OPENAI_MAX_OUTPUT_TOKENS: "7500", LLM_PROMPT_VERSION: "test-v2" });
  assert.equal(provider.provider, "openai");
  assert.equal(provider.promptVersion, "test-v2");
  assert.deepEqual(await provider.planStory(planInput), plan);
});

test("OpenAI assembles typed message text after reasoning items and validates a scene", async (t) => {
  mockFetch(t, (_url, request) => {
    const headers = new Headers(request.headers);
    assert.equal(headers.get("OpenAI-Organization"), null);
    assert.equal(headers.get("OpenAI-Project"), null);
    assert.equal(JSON.parse(String(request.body)).max_output_tokens, 6000);
    const content = JSON.stringify(scene);
    return { status: "completed", output: [
      { type: "reasoning", content: [{ type: "output_text", text: "ignore this" }] },
      { type: "message", content: [{ type: "output_text", text: content.slice(0, 50) }, { type: "output_text", text: content.slice(50) }] },
    ] };
  });
  assert.deepEqual(await createLlmProvider(openai).writeScene(sceneInput), scene);
});

test("OpenAI resolves only requested gloss indexes and skips empty requests", async (t) => {
  const fetch = mockFetch(t, () => responses({ resolutions: [
    { tokenIndex: 0, meaning: "信" }, { tokenIndex: 3, meaning: "outside request" }, { tokenIndex: 0, meaning: 42 },
  ] }));
  const provider = createLlmProvider(openai);
  assert.deepEqual(await provider.resolveGlosses(glossInput), [{ tokenIndex: 0, meaning: "信" }]);
  assert.deepEqual(await provider.resolveGlosses({ ...glossInput, unresolvedTokenIndexes: [] }), []);
  assert.equal(fetch.mock.callCount(), 1);
});

test("OpenAI and Gemini share scene validation and require exactly three choices", async (t) => {
  mockFetch(t, (url) => url.includes("api.openai.com")
    ? responses({ ...scene, choices: scene.choices.slice(0, 2) })
    : { choices: [{ message: { content: JSON.stringify({ ...scene, choices: scene.choices.slice(0, 2) }) } }] });
  for (const env of [openai, legacy]) await assert.rejects(createLlmProvider(env).writeScene(sceneInput), /Scene response was invalid/);
});

test("unknown provider or missing OpenAI configuration fails before any request without falling back", (t) => {
  const fetch = mockFetch(t, () => { throw new Error("must not request"); });
  for (const env of [
    { ...legacy, LLM_PROVIDER: "typo" },
    { ...legacy, ...openai, OPENAI_API_KEY: "" },
    { ...legacy, ...openai, OPENAI_MODEL: "" },
    { ...legacy, ...openai, OPENAI_API_KEY: "   " },
    { ...openai, OPENAI_MAX_OUTPUT_TOKENS: "0" },
    { ...openai, OPENAI_MAX_OUTPUT_TOKENS: "1.5" },
    { ...openai, OPENAI_MAX_OUTPUT_TOKENS: "NaN" },
  ]) assert.throws(() => createLlmProvider(env), isProviderError(false));
  assert.equal(fetch.mock.callCount(), 0);
});

for (const [name, response] of [
  ["refusal", { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private upstream content" }] }] }],
  ["token truncation", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, ...{ output: responses(plan).output } }],
  ["content filter", { status: "incomplete", incomplete_details: { reason: "content_filter" } }],
  ["non-transient response failure", { status: "failed", error: { code: "invalid_request", message: "private upstream content" } }],
] as const) {
  test(`OpenAI ${name} is safe and does not trigger retries or Gemini fallback`, async (t) => {
    const fetch = mockFetch(t, (url) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      return response;
    });
    await assert.rejects(createLlmProvider({ ...legacy, ...openai }).planStory(planInput), (error: unknown) => {
      assert.ok(isProviderError(false)(error));
      assert.doesNotMatch(String(error), /private upstream/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
  });
}

for (const status of [400, 401, 403, 404, 429]) {
  test(`HTTP ${status} configuration/quota errors are safe and not retried`, async (t) => {
    const fetch = mockFetch(t, () => Response.json({ error: { code: status === 429 ? "insufficient_quota" : "invalid_request", message: "test-openai-only private premise" } }, { status }));
    await assert.rejects(createLlmProvider(openai).planStory(planInput), (error: unknown) => {
      assert.ok(isProviderError(false)(error));
      assert.doesNotMatch(String(error), /test-openai-only|private premise/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
  });
}

for (const status of [429, 503]) {
  test(`transient HTTP ${status} retries and recovers`, async (t) => {
    let calls = 0;
    const fetch = mockFetch(t, () => ++calls === 1 ? Response.json({ error: { code: "rate_limit" } }, { status }) : responses(plan));
    assert.deepEqual(await createLlmProvider(openai).planStory(planInput), plan);
    assert.equal(fetch.mock.callCount(), 2);
  });
}

test("missing output text, malformed JSON and transport errors are bounded and sanitized", async (t) => {
  let calls = 0;
  const fetch = mockFetch(t, () => {
    calls++;
    if (calls === 1) return { status: "completed", output: [] };
    if (calls === 2) return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }] };
    throw new Error("test-openai-only private premise");
  });
  await assert.rejects(createLlmProvider(openai).planStory(planInput), (error: unknown) => {
    assert.ok(isProviderError(true)(error));
    assert.doesNotMatch(String(error), /test-openai-only|private premise/);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 3);
});


test("OPENAI_KEY alias is accepted and OPENAI_API_KEY takes priority when both are set", async (t) => {
  const keys: string[] = [];
  mockFetch(t, (_url, request) => {
    keys.push(new Headers(request.headers).get("Authorization") ?? "");
    assert.deepEqual(JSON.parse(String(request.body)).reasoning, { effort: "medium" });
    return responses(plan);
  });
  for (const env of [
    { ...openai, OPENAI_API_KEY: undefined, OPENAI_KEY: "test-alias" },
    { ...openai, OPENAI_API_KEY: "  ", OPENAI_KEY: "test-alias" },
    { ...openai, OPENAI_KEY: "test-alias" },
  ]) await createLlmProvider({ ...env, OPENAI_REASONING_EFFORT: "medium" }).planStory(planInput);
  assert.deepEqual(keys, ["Bearer test-alias", "Bearer test-alias", `Bearer ${openai.OPENAI_API_KEY}`]);
  assert.throws(() => createLlmProvider({ ...openai, OPENAI_REASONING_EFFORT: "typo" }), isProviderError(false));
});

test('opt-in usage telemetry retains only stage, timing and usage counters',async(t)=>{
 const logs:unknown[][]=[];t.mock.method(console,'log',(...args:unknown[])=>{logs.push(args);});
 mockFetch(t,()=>({...responses(plan),usage:{input_tokens:120,output_tokens:30,total_tokens:150,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:10}},private_prompt:'must not log',secret:'must not log'}));
 const p=createLlmProvider({...openai,LLM_USAGE_TELEMETRY:'true'});assert.deepEqual(await p.planStory(planInput),plan);
 assert.equal(logs.length,1);const value=JSON.parse(String(logs[0][0]));assert.equal(value.event,'generation_llm_usage');assert.equal(value.stage,'plan');assert.equal(value.inputTokens,120);assert.equal(value.cachedInputTokens,20);assert.equal(value.outputTokens,30);assert.equal(value.reasoningTokens,10);assert.equal(value.totalTokens,150);assert.equal(value.outcome,'completed');assert.ok(value.durationMs>=0);assert.doesNotMatch(JSON.stringify(value),/must not log|test-openai-only|premise/);
});
test('transport failure usage remains unknown rather than reporting zero cost',async(t)=>{
 const logs:unknown[][]=[];t.mock.method(console,'log',(...args:unknown[])=>{logs.push(args);});mockFetch(t,()=>{throw Error('private transport detail');});
 await assert.rejects(createLlmProvider({...openai,LLM_USAGE_TELEMETRY:'true',LLM_REQUEST_ATTEMPTS:'1'}).planStory(planInput));const value=JSON.parse(String(logs[0][0]));assert.equal(value.outcome,'unavailable');for(const key of ['inputTokens','outputTokens','totalTokens'])assert.equal(value[key],null);assert.doesNotMatch(JSON.stringify(value),/private transport/);
});
