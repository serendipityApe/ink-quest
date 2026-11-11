import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/components/PaymentAvailabilityNotice.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness() {
  let state, effect, resolve, reject, request;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports,
    fetch(url, options) { request = { url, options }; return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    require(name) {
      if (name === 'react') return {
        useState(initial) { if (state === undefined) state = initial; return [state, (next) => { state = next; }]; },
        useEffect(fn) { effect = fn; },
      };
      return require(name);
    },
  });
  return { render: (isZh = false) => mod.exports.default({isZh}), mount: () => effect(),
    respond: (config, ok = true) => resolve({ok, json: async () => config}), fail: () => reject(new Error('offline')), request: () => request };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
for (const zh of [false, true]) test(`homepage availability starts closed (${zh ? 'zh' : 'en'})`, () => {
  const h = harness(); const view = h.render(zh);
  assert.equal(view.props.role, 'status');
  assert.match(view.props.children, zh ? /暂未开放.*计划价格/ : /not yet available.*planned/);
});
test('only explicit true removes notice, using uncached public config', async () => {
  const h = harness(); h.render(); h.mount();
  assert.equal(h.request().url, '/api/billing/config'); assert.equal(h.request().options.cache, 'no-store');
  h.respond({checkoutEnabled: true}); await settle(); assert.equal(h.render(), null);
});
for (const config of [{checkoutEnabled: false}, {checkoutEnabled: 'true'}, {}]) test(`non-enabled config keeps notice: ${JSON.stringify(config)}`, async () => {
  const h = harness(); h.render(); h.mount(); h.respond(config); await settle(); assert.ok(h.render());
});
test('failure and HTTP error do not claim payments are open', async () => {
  for (const fail of [true, false]) { const h = harness(); h.render(); h.mount(); if (fail) h.fail(); else h.respond({checkoutEnabled: true}, false); await settle(); assert.ok(h.render()); }
});
test('late response after unmount cannot alter availability', async () => {
  const h = harness(); h.render(); const cleanup = h.mount(); cleanup(); h.respond({checkoutEnabled: true}); await settle(); assert.ok(h.render());
});
