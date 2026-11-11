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
const { renderToStaticMarkup } = require('react-dom/server');
function html(props, lang='en') {
  const Client=load('src/app/my-stories/MyStoriesView.tsx', {
    'next/link': { default: ({children,...props}) => require('react').createElement('a',{...props,prefetch:undefined,onNavigate:undefined},children) },
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

test('loading is explicit and never rendered as empty', () => {
  const result = html({stories:[],page:1,hasMore:false,unavailable:false,pending:true});
  assert.match(result,/Loading your stories/); assert.doesNotMatch(result,/No stories yet/);
});
