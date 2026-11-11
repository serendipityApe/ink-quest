// Offline React lifecycle harness. Install isolated renderer (no app dependency changes):
// npm install --prefix /tmp/inkquest-ui-harness --ignore-scripts --no-package-lock react-test-renderer@19.2.4 react@19.2.4
// node tests/story-library-component-harness.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(`${process.env.INKQUEST_TEST_RENDERER_ROOT ?? '/tmp/inkquest-ui-harness'}/package.json`);
const React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let search='',renderer,latest,subscription,requests=[],redirects=[],history=[''];let position=0;
const router={replace:url=>redirects.push(url)};
function load(path,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,AbortController,queueMicrotask,window:{history:{pushState(_s,_t,url){search=url.includes('?')?url.slice(url.indexOf('?')):'';history=history.slice(0,position+1);history.push(search);position++;renderer.update(React.createElement(Client));}}},require:name=>mocks[name]??require(name)});return module.exports;}
const helpers=load('src/lib/generation/story-library.ts');
const loader=load('src/lib/generation/story-library-client.ts',{'./story-library':helpers});
const supabase={auth:{onAuthStateChange(callback){subscription=callback;return{data:{subscription:{unsubscribe(){if(subscription===callback)subscription=null;}}}};}},from(){const query={};for(const key of ['select','eq','order','range'])query[key]=(...args)=>{if(key==='eq')query.owner=args[1];if(key==='range')query.rangeValue=args;return query;};query.abortSignal=signal=>new Promise(resolve=>requests.push({resolve,signal,owner:query.owner,range:query.rangeValue}));return query;}};
const Client=load('src/app/my-stories/MyStoriesClient.tsx',{
 'next/navigation':{useSearchParams:()=>new URLSearchParams(search),useRouter:()=>router},
 '@/lib/supabase/client':{isSupabaseConfigured:()=>true,createClient:()=>supabase},
 '@/lib/generation/story-library':helpers,'@/lib/generation/story-library-client':loader,
 './MyStoriesView':{default:props=>{latest=props;return React.createElement('div',null,props.pending?'pending':props.stories.map(s=>s.id).join(','));}}
}).default;
const event=async(owner,type='INITIAL_SESSION')=>act(async()=>{subscription(type,owner?{user:{id:owner}}:null);});
const resolve=async(index,id,error=null)=>act(async()=>requests[index].resolve({data:id?[{id}]:[],error}));
await act(async()=>{renderer=create(React.createElement(Client));});
assert.equal(latest.pending,true);assert.equal(requests.length,0);
await event('a');assert.equal(requests[0].owner,'a');await resolve(0,'a-story');assert.equal(latest.stories[0].id,'a-story');
await act(async()=>{subscription('SIGNED_IN',{user:{id:'b'}});});
assert.equal(latest.pending,true);assert.equal(latest.stories.length,0);assert.equal(requests[1].owner,'b');
await resolve(1,'b-story');
await act(async()=>latest.navigate(2));assert.equal(latest.pending,true);
// Extra render while INITIAL_SESSION is delayed must not resurrect page one's rows.
await act(async()=>renderer.update(React.createElement(Client)));assert.equal(latest.stories.length,0);
await event('b');assert.deepEqual(Array.from(requests[2].range),[20,40]);
await resolve(2,null,{message:'expired'});assert.equal(latest.unavailable,true);
await act(async()=>latest.refresh());assert.equal(latest.pending,true);await event('b');assert.deepEqual(Array.from(requests[3].range),[20,40]);await resolve(3,'page2');
await act(async()=>{position--;search=history[position];renderer.update(React.createElement(Client));});assert.equal(latest.page,1);assert.equal(latest.pending,true);await event('b');await resolve(4,'page1');
await act(async()=>{position++;search=history[position];renderer.update(React.createElement(Client));});assert.equal(latest.page,2);await event('b');await resolve(5,'page2');
await event(null,'SIGNED_OUT');assert.equal(latest.stories.length,0);assert.equal(redirects.at(-1),'/login?next=%2Fmy-stories%3Fpage%3D2');
await act(async()=>renderer.unmount());
search='';await act(async()=>{renderer=create(React.createElement(Client));});await event(null);assert.equal(redirects.at(-1),'/login?next=%2Fmy-stories');assert.equal(requests.length,6);await act(async()=>renderer.unmount());
console.log('PASS actual React effects: existing/null session, account switch clearing, delayed session rerender, page2 refresh, failure recovery, Back/Forward and signout returnTo; no network or production tokens.');
