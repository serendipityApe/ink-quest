import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => mocks[name] ?? require(name) });
  return module.exports;
}
const helpers = load('src/lib/generation/story-library.ts');
test('bounded pagination rejects malformed input', () => {
  for (const value of [undefined, '0', '-1', '1.5', '2 OR 1=1', '100000', ['2']]) assert.equal(helpers.storyPage(value), 1);
  assert.equal(helpers.storyPage('3'), 3);
});
test('all persisted statuses have non-destructive labels', () => {
  for (const value of ['draft', 'generating', 'active', 'paused', 'archived', 'failed']) {
    assert.ok(helpers.storyStatus(value, true)); assert.ok(helpers.storyStatus(value, false));
  }
  assert.equal(helpers.storyStatus('failed', false), 'Generation incomplete');
});
function pageHarness(user, result) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.range = async (...args) => { calls.push(['range', ...args]); return result; };
  const client = { from(name) { calls.push(['from', name]); return query; } };
  const page = load('src/app/my-stories/page.tsx', {
    'next/navigation': { redirect: (url) => { throw new Error('redirect:' + url); } },
    '@/lib/dal': { getUser: async () => user },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/generation/story-library': helpers,
    './MyStoriesClient': { default: 'MyStoriesClient' },
  }).default;
  return { page, calls };
}
test('unauthenticated readers never query private stories', async () => {
  const { page, calls } = pageHarness(null, {});
  await assert.rejects(() => page({ searchParams: Promise.resolve({}) }), /redirect:\/login\?next=\/my-stories/);
  assert.equal(calls.length, 0);
});
test('list is owner scoped, stable sorted and bounded with one lookahead', async () => {
  const rows = Array.from({length:21}, (_,i) => ({id:String(i)}));
  const {page,calls} = pageHarness({id:'owner-a'}, {data:rows,error:null});
  const rendered = await page({ searchParams: Promise.resolve({page:'2'}) });
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'owner_id' && c[2] === 'owner-a'));
  assert.ok(calls.some(c => c[0] === 'range' && c[1] === 20 && c[2] === 40));
  assert.deepEqual(calls.filter(c => c[0] === 'order').map(c => c[1]), ['created_at','id']);
  assert.equal(rendered.props.stories.length,20); assert.equal(rendered.props.hasMore,true);
});
test('database failure is not shown as an empty library', async () => {
  const {page} = pageHarness({id:'owner'}, {data:null,error:{message:'unavailable'}});
  const rendered = await page({searchParams:Promise.resolve({})});
  assert.equal(rendered.props.unavailable,true);
});
const { renderToStaticMarkup } = require('react-dom/server');
function html(props, lang='en') {
  const Client=load('src/app/my-stories/MyStoriesClient.tsx', {
    'next/link': { default: ({children,...props}) => require('react').createElement('a',{...props,prefetch:undefined},children) },
    'next/navigation': {useRouter:()=>({refresh(){}})},
    '@/components/Navbar': {default:()=>null},
    '@/i18n/I18nProvider': {useTranslations:()=>({lang})},
    '@/lib/generation/story-library':helpers,
  }).default;
  return renderToStaticMarkup(require('react').createElement(Client,props));
}
test('cards resume exact story without generation and escape title', () => {
  const result=html({stories:[{id:'saved-1',title:'<script>x</script>',target_language:'en',learner_level:'B1',status:'active',current_node_id:'node',created_at:'2026-11-11T09:00:00Z'}],page:1,hasMore:false,unavailable:false});
  assert.match(result,/href="\/generate\?story=saved-1"/); assert.match(result,/Continue reading/); assert.match(result,/&lt;script&gt;/);
});
test('empty, failure, pending and pagination affordances', () => {
  assert.match(html({stories:[],page:1,hasMore:false,unavailable:false} ),/No stories yet/);
  assert.match(html({stories:[],page:2,hasMore:false,unavailable:false}),/Back to first page/);
  assert.match(html({stories:[],page:1,hasMore:false,unavailable:true}),/does not mean your stories were deleted/);
  const pending={id:'pending',title:null,status:'generating',target_language:'zh',learner_level:'HSK 4',current_node_id:null,created_at:'2026-11-11'};
  const result=html({stories:[pending],page:2,hasMore:true,unavailable:false},'zh');
  assert.match(result,/查看生成状态/);assert.match(result,/正在生成/);assert.match(result,/my-stories\?page=3/);assert.match(result,/my-stories\?page=1/);
});
