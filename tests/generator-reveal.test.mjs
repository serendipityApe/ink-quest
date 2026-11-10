import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual component with deterministic hooks and local-only I/O.
// No DOM library, network, speech synthesis, model calls, or real timers are used.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/generate/GeneratorClient.tsx", import.meta.url), "utf8");
const stateNames = [...source.matchAll(/const \[(\w+), \w+\] = useState/g)].map((match) => match[1]);
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(language, count, plain = false) {
  const segments = Array.from({ length: count }, (_, i) => ({
    word: language === "zh" ? `词${i}。` : `word${i}.`, tier: "base", reading: null, meaning: null, level: null,
  }));
  return {
    story: { id: "fixture", title: "Fixture", target_language: language, learner_level: "B1", tts_mode: "off", current_node_id: "scene" },
    nodes: [{ id: "scene", text: language === "zh" ? "风起了。🌙" : "A breeze rose. 🌙", text_segments: plain ? null : segments, story_choices: [{ id: "choice", label: "Continue fixture" }] }],
    jobs: [], audioAssets: [],
  };
}

function harness(data, reducedMotion = false) {
  const states = new Map();
  const refs = [];
  const callbacks = [];
  const effects = [];
  const calls = { stopped: 0, played: [], requests: [], timers: 0 };
  let stateIndex = 0;
  let refIndex = 0;
  const forbidTimer = () => { calls.timers++; throw new Error("Unexpected presentation timer"); };
  const hooks = {
    useState(initial) {
      const key = stateNames[stateIndex++];
      if (!states.has(key)) states.set(key, initial);
      return [states.get(key), (value) => states.set(key, typeof value === "function" ? value(states.get(key)) : value)];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useCallback(callback) { callbacks.push(callback); return callback; },
    useMemo(callback) { return callback(); },
    useEffect(effect) { effects.push(effect); },
  };
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: compiledModule, exports: compiledModule.exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "@/hooks/useAudioSync") return { useAudioSync: () => ({ isPlaying: false, activeSegmentIndex: -1, stop: () => calls.stopped++, play: (args) => calls.played.push(args) }) };
      if (name === "@/i18n/I18nProvider") return { useTranslations: () => ({ lang: "en" }) };
      if (name === "@/lib/savedWords") return { loadSavedWords: () => [] };
      if (name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      return { default: name };
    },
    window: { matchMedia: () => ({ matches: reducedMotion }), setInterval: forbidTimer },
    setInterval: forbidTimer, setTimeout: forbidTimer,
    fetch: async (url, options) => {
      calls.requests.push({ url, options });
      if (url.includes("/jobs/")) return { ok: true, json: async () => ({ job: { status: "completed", stage: "completed" } }) };
      if (url === "/api/billing/status") return { ok: true, json: async () => ({ credits: { available: 10 } }) };
      assert.equal(url, "/api/generated-stories/fixture");
      return { ok: true, json: async () => data };
    },
  });
  const render = () => {
    stateIndex = refIndex = 0;
    callbacks.length = effects.length = 0;
    return compiledModule.exports.default({ initialStoryId: "fixture" });
  };
  render();
  return { states, calls, callbacks, effects, render, load: (...args) => callbacks[1](...args) };
}

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function button(tree, label) {
  return elements(tree).find((element) => element.type === "button" && text(element) === label);
}

for (const language of ["zh", "en"]) {
  for (const count of [0, 1, 2, 371, 2000]) {
    for (const reducedMotion of [false, true]) {
      test(`${language}, ${count} segments, reduced motion ${reducedMotion}: complete immediately with usable controls`, async () => {
        const data = fixture(language, count);
        const h = harness(data, reducedMotion);
        await h.load("fixture", { stopPlaybackForNewNodes: true });
        const tree = h.render();
        const words = elements(tree).filter((element) => element.props?.segment);
        assert.equal(words.length, count * 2, "desktop and mobile both contain every segment in the first render");
        assert.equal(elements(tree).filter((element) => element.props?.["aria-busy"]).length, 0);
        const listen = button(tree, "Listen");
        assert.ok(listen);
        assert.ok(!listen.props.disabled);
        listen.props.onClick();
        assert.equal(h.calls.played.length, 1);
        if (count) assert.ok(h.calls.played[0].text.endsWith(data.nodes[0].text_segments.at(-1).word));
        assert.ok(!button(tree, "AContinue fixture").props.disabled);
        assert.equal(h.calls.timers, 0);
      });
    }
  }
}

test("plain Chinese/English text including Unicode is never sliced", async () => {
  for (const language of ["zh", "en"]) {
    const data = fixture(language, 0, true);
    const h = harness(data);
    await h.load("fixture", { stopPlaybackForNewNodes: true });
    assert.ok(text(h.render()).includes(data.nodes[0].text));
  }
});

test("existing stories do not interrupt audio; a new scene does once, repeated TTS refresh does not", async () => {
  const data = fixture("zh", 371);
  const h = harness(data);
  await h.load("fixture");
  assert.equal(h.calls.stopped, 0);
  data.nodes.push({ ...data.nodes[0], id: "next-scene" });
  await h.load("fixture", { stopPlaybackForNewNodes: true });
  assert.equal(h.calls.stopped, 1);
  await h.load("fixture", { stopPlaybackForNewNodes: true });
  assert.equal(h.calls.stopped, 1);
});

test("job completion unlocks branch choices without any presentation timer", async () => {
  const h = harness(fixture("en", 2000));
  await h.load("fixture");
  h.states.set("activeJob", { jobId: "job", storyId: "fixture", branch: true });
  const pending = h.render();
  assert.equal(button(pending, "AContinue fixture").props.disabled, true);
  const poll = h.effects.find((effect) => effect.toString().includes("job_poll_failed"));
  assert.ok(poll);
  const cleanup = poll();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.states.get("activeJob"), null);
  assert.ok(!button(h.render(), "AContinue fixture").props.disabled);
  assert.equal(h.calls.timers, 0);
  cleanup();
});

 test("sentence playback retains original segment offsets and complete trailing sentence", async () => {
  const data = fixture("en", 3);
  data.nodes[0].text_segments[2].word = "unfinished";
  const h = harness(data);
  await h.load("fixture", { stopPlaybackForNewNodes: true });
  const sentences = elements(h.render()).filter((element) => element.props?.["aria-label"] === "Play current sentence");
  assert.equal(sentences.length, 3);
  sentences[2].props.onClick();
  assert.equal(h.calls.played[0].segmentOffset, 2);
  assert.equal(h.calls.played[0].text, "unfinished");
});

test("reader controls retain native keyboard semantics and accessible complete content", async () => {
  const data = fixture("en", 371);
  const h = harness(data);
  await h.load("fixture", { stopPlaybackForNewNodes: true });
  const tree = h.render();
  const all = elements(tree);
  const controls = [button(tree, "Listen"), button(tree, "AContinue fixture"), ...all.filter((element) => element.props?.["aria-label"] === "Play current sentence")];
  for (const control of controls) {
    assert.equal(control.type, "button", "native Enter/Space and tab behavior is retained");
    assert.equal(control.props.type, "button");
    assert.equal(control.props.tabIndex, undefined, "no negative tabIndex removes keyboard access");
    assert.ok(!control.props.disabled);
    assert.equal(control.props["aria-hidden"], undefined);
    assert.equal(typeof control.props.onClick, "function");
  }
  assert.equal(all.some((element) => "aria-busy" in (element.props ?? {})), false);
  const scene = all.find((element) => element.props?.["aria-label"] === "Story scene 1");
  assert.ok(scene);
  assert.equal(elements(scene).some((element) => element.props?.["aria-hidden"]), false);
  const desktop = elements(scene).find((element) => element.type === "p" && element.props.className.includes("md:block"));
  const mobile = elements(scene).find((element) => element.type === "div" && element.props.className.includes("md:hidden"));
  for (const layout of [desktop, mobile]) {
    assert.deepEqual(elements(layout).filter((element) => element.props?.segment).map((element) => element.props.segment.word), data.nodes[0].text_segments.map((segment) => segment.word));
  }
});
