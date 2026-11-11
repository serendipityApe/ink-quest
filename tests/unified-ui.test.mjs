import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const navbarSource = readFileSync(new URL("../src/components/Navbar.tsx", import.meta.url), "utf8");
const wordSource = readFileSync(new URL("../src/components/WordSegment.tsx", import.meta.url), "utf8");
const navbarCompiled = ts.transpileModule(navbarSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
function renderNavbar(props, { user = { id: "test-user" }, fetchedCredits = 99, mobileOpen = false } = {}) {
  const testModule = { exports: {} };
  // Seed the actual component's open/account/user/credits/resume state. Effects
  // are deliberately not run: this verifies the render during a pending fetch.
  const states = [mobileOpen, false, user, fetchedCredits, null];
  let stateIndex = 0;
  vm.runInNewContext(navbarCompiled, {
    module: testModule, exports: testModule.exports,
    require(name) {
      if (name === "react") return {
        useState: () => [states[stateIndex++], () => {}],
        useRef: value => ({ current: value }), useEffect() {},
      };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/navigation") return { usePathname: () => "/generate" };
      if (name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      if (name === "@/lib/supabase/client") return { isSupabaseConfigured: () => true, createClient() { throw new Error("Unexpected auth action"); } };
      if (name === "@/i18n/I18nProvider") return { useTranslations: () => ({ lang: "en", t: key => key, setLang() {} }) };
      if (name === "@/lib/stories/entry-points") return { DEFAULT_STORY_HREF: "/stories/demo", WITHDRAWN_STORY_IDS: new Set() };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return testModule.exports.default(props);
}

for (const [value, expected] of [[17, "17"], [0, "0"], [null, "—"]]) {
  test(`navbar uses current generation credit balance ${value} rather than stale fetched balance`, () => {
    const tree = renderNavbar({ creditBalance: value }, { fetchedCredits: 99 });
    const balanceLink = elements(tree).find(el => el.props?.["aria-label"] === `${expected} credits`);
    assert.ok(balanceLink, `Expected current balance ${expected}`);
    assert.equal(text(balanceLink), expected);
    assert.equal(elements(tree).some(el => el.props?.["aria-label"] === "99 credits"), false);
  });
}

test("navbar retains independently fetched balance when parent does not supply one", () => {
  const tree = renderNavbar({}, { fetchedCredits: 63 });
  assert.equal(text(elements(tree).find(el => el.props?.["aria-label"] === "63 credits")), "63");
});

for (const mobileOpen of [false, true]) {
  test(`signed-in navbar exposes saved stories in ${mobileOpen ? "desktop and mobile" : "desktop"} navigation`, () => {
    const links = elements(renderNavbar({}, { mobileOpen })).filter(el => el.props?.href === "/my-stories");
    assert.equal(links.length, mobileOpen ? 2 : 1);
    assert.ok(links.every(link => text(link) === "My stories"));
    assert.equal(elements(renderNavbar({}, { mobileOpen, user: null })).some(el => el.props?.href === "/my-stories"), false);
  });
}

// Run the actual positioning body, not a second implementation or a substring
// assertion. DOM measurements are inputs; the result must connect the word to
// the side card along a real horizontal pointer path.
const geometryStart = wordSource.indexOf("      const triggerRect = triggerRef.current.getBoundingClientRect();");
const geometryEnd = wordSource.indexOf("\n    };", geometryStart);
assert.ok(geometryStart >= 0 && geometryEnd > geometryStart, "Positioning callback must be found");
const geometryCompiled = ts.transpileModule(wordSource.slice(geometryStart, geometryEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function position({ trigger, articleRight, width = 1600, height = 900, tooltipHeight = 190 }) {
  let result;
  vm.runInNewContext(geometryCompiled, {
    triggerRef: { current: { getBoundingClientRect: () => trigger, closest: () => ({ getBoundingClientRect: () => ({ right: articleRight }) }) } },
    tooltipRef: { current: { getBoundingClientRect: () => ({ width: 260, height: tooltipHeight }) } },
    window: { innerWidth: width, innerHeight: height },
    setTooltipPosition(value) { result = value; },
  });
  return result;
}
function containsBridge(p, x, y) {
  return x >= p.bridgeLeft && x <= p.bridgeLeft + p.bridgeWidth
    && y >= p.bridgeTop && y <= p.bridgeTop + p.bridgeHeight;
}

for (const top of [80, 400, 810]) {
  test(`side dictionary keeps the horizontal pointer corridor connected at top=${top}`, () => {
    const trigger = { left: 520, right: 575, top, bottom: top + 30, width: 55, height: 30 };
    const p = position({ trigger, articleRight: 1000 });
    assert.equal(p.left, 1040);
    assert.ok(p.top >= 8 && p.top + 190 <= 892);
    const y = top + 15;
    for (let x = trigger.right; x <= p.left; x += 5) assert.ok(containsBridge(p, x, y), `Gap at ${x}, ${y}`);
    assert.ok(containsBridge(p, p.left, y));
    assert.ok(p.bridgeWidth > 0 && p.bridgeHeight > 0);
  });
}

test("narrow desktop keeps the original vertical tooltip bridge", () => {
  const trigger = { left: 520, right: 575, top: 400, bottom: 430, width: 55, height: 30 };
  const p = position({ trigger, articleRight: 800, width: 1000 });
  assert.ok(p.left + 260 <= 992);
  assert.equal(p.top, 202);
  for (let y = p.top + 190; y <= trigger.top; y++) assert.ok(containsBridge(p, 550, y));
});

for (const component of ["Navbar", "Footer"]) {
  test(`${component} navigation disables automatic route prefetch`, () => {
    const source = readFileSync(new URL(`../src/components/${component}.tsx`, import.meta.url), "utf8");
    const tree = ts.createSourceFile(`${component}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let count = 0;
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === "Link") {
        count++;
        const prop = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(tree) === "prefetch");
        assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword, "Every shared navigation Link must explicitly disable prefetch");
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.ok(count > 0);
  });
}
