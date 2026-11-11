import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/WordSegment.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;

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
function harness(segment, learningEnabled) {
  const states = [];
  let index = 0;
  let longPress;
  let saves = 0;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    setTimeout: (fn) => { longPress = fn; return 1; }, clearTimeout() {},
    window: { matchMedia: () => ({ matches: false }) },
    require(name) {
      if (name === "react") return {
        useState(initial) {
          const i = index++;
          if (!(i in states)) states[i] = initial;
          return [states[i], (value) => { states[i] = value; }];
        },
        useRef: (initial) => ({ current: initial }),
        useCallback: (fn) => fn, useEffect() {},
      };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      if (name === "@/hooks/useSpeak") return { useSpeak: () => ({ speak() {}, supported: true }) };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const render = () => {
    index = 0;
    return module.exports.default({ segment, learningEnabled, index: 0, lang: "zh", isSaved: false, isAudioActive: false, onToggleSave: () => saves++ });
  };
  return { render, longPress: () => longPress?.(), saves: () => saves };
}

for (const tier of ["base", "normal", "key"]) {
  test(`pending ${tier} word offers mobile pinyin/pronunciation without empty save card`, () => {
    const h = harness({ word: "线索", reading: "xiàn suǒ", meaning: null, level: null, tier }, false);
    const tree = h.render();
    assert.equal(typeof tree.props.onPointerDown, "function");
    tree.props.onPointerDown({ pointerType: "touch", preventDefault() {} });
    h.longPress();
    const open = h.render();
    assert.ok(text(open).includes("xiàn suǒ"));
    assert.ok(elements(open).some((el) => el.props?.["aria-label"] === "Pronounce 线索"));
    assert.equal(elements(open).some((el) => el.type === "button" && text(el).includes("Save")), false);
    assert.equal(h.saves(), 0);
  });
}

test("truly empty pending word remains noninteractive", () => {
  const h = harness({ word: "线索", reading: null, meaning: null, level: null, tier: "key" }, false);
  const tree = h.render();
  assert.equal(text(tree), "线索");
  assert.equal(tree.props.onPointerDown, undefined);
  assert.equal(tree.props.onClick, undefined);
});

test("completed definitions and legacy default retain original save behavior", () => {
  for (const enabled of [true, undefined]) {
    const h = harness({ word: "线索", reading: "xiàn suǒ", meaning: "clue", level: "HSK 4", tier: "key" }, enabled);
    h.render().props.onClick();
    const open = h.render();
    assert.ok(text(open).includes("clue"));
    const save = elements(open).find((el) => el.type === "button" && text(el).includes("Save"));
    assert.ok(save);
    save.props.onClick({ stopPropagation() {} });
    assert.equal(h.saves(), 1);
  }
});
