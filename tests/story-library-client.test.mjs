import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, mocks={}) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
 {module,exports:module.exports,AbortController,require:name=>mocks[name]});return module.exports;
}
const helpers=load('src/lib/generation/story-library.ts');
const {createLibraryLoader}=load('src/lib/generation/story-library-client.ts',{'./story-library':helpers});
function harness() {
 const requests=[],states=[];
 const client={from(table){const calls=[['from',table]],query={}; for(const name of ['select','eq','order','range'])query[name]=(...args)=>{calls.push([name,...args]);return query;};
 query.abortSignal=signal=>new Promise((resolve,reject)=>requests.push({calls,signal,resolve,reject}));return query;}};
 return {requests,states,loader:createLibraryLoader(client,s=>states.push(s))};
}
test('owner scoped stable bounded query with lookahead',async()=>{
 const h=harness(),done=h.loader.load('owner-a',2),r=h.requests[0];
 assert.ok(r.calls.some(c=>c[0]==='eq'&&c[1]==='owner_id'&&c[2]==='owner-a'));
 assert.ok(r.calls.some(c=>c[0]==='range'&&c[1]===20&&c[2]===40));
 assert.deepEqual(r.calls.filter(c=>c[0]==='order').map(c=>c[1]),['created_at','id']);
 r.resolve({data:Array.from({length:21},(_,i)=>({id:String(i)})),error:null});await done;
 assert.equal(h.states.at(-1).stories.length,20);assert.equal(h.states.at(-1).hasMore,true);
});
test('late old page and old account responses cannot replace new result',async()=>{
 const h=harness(),old=h.loader.load('a',1);h.loader.clear();
 assert.equal(h.states.at(-1).stories.length,0);assert.equal(h.requests[0].signal.aborted,true);
 const fresh=h.loader.load('b',2);h.requests[1].resolve({data:[{id:'b'}]});await fresh;
 h.requests[0].resolve({data:[{id:'a'}]});await old;
 assert.equal(h.states.at(-1).stories[0].id,'b');
});
test('refresh aborts in-flight reads and failure differs from empty',async()=>{
 const h=harness(),old=h.loader.load('a',1),fresh=h.loader.load('a',1);
 assert.equal(h.requests[0].signal.aborted,true);
 h.requests[1].reject(new Error('network'));await fresh;
 assert.equal(h.states.at(-1).unavailable,true);assert.equal(h.states.at(-1).pending,false);
 h.requests[0].resolve({data:[]});await old;assert.equal(h.states.at(-1).unavailable,true);
});
test('unmount cancels results and no success is published',async()=>{
 const h=harness(),done=h.loader.load('a',1);h.loader.cancel();h.requests[0].resolve({data:[{id:'a'}]});await done;
 assert.equal(h.states.length,1);assert.equal(h.states[0].pending,true);
});
test('static shell cannot read user cookies or private data',()=>{
 const page=fs.readFileSync('src/app/my-stories/page.tsx','utf8');
 assert.match(page,/dynamic = "error"/);assert.doesNotMatch(page,/getUser|cookies\(|supabase|searchParams:/);
 const middleware=fs.readFileSync('src/middleware.ts','utf8');
 assert.ok(middleware.indexOf('request.nextUrl.pathname === "/my-stories"')<middleware.indexOf('if (!isSupabaseConfigured())'));
 assert.match(middleware,/await supabase.auth.getUser\(\)/);
});
test('only exact static shell bypasses middleware auth',async()=>{
 let calls=0;
 const middleware=load('src/middleware.ts',{
  'next/server':{NextResponse:{next:()=>({cookies:{set(){}}})}},
  '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>{calls++;}}})},
  './lib/supabase/env':{isSupabaseConfigured:()=>true,getSupabaseBrowserEnv:()=>({url:'http://test',anonKey:'mock'})}
 }).middleware;
 const request=pathname=>({nextUrl:{pathname},cookies:{getAll:()=>[],set(){}}});
 await middleware(request('/my-stories'));assert.equal(calls,0);
 for(const path of ['/my-stories-evil','/api/generated-stories','/generate','/my-stories/nested'])await middleware(request(path));
 assert.equal(calls,4);
});
test('story creation remains authenticated before any write',async()=>{
 let writes=0;
 const source=fs.readFileSync('src/app/api/generated-stories/route.ts','utf8');
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,Response,require:name=>name==='@/lib/dal'?{getUser:async()=>null}:name==='@/lib/supabase/admin'?{createAdminClient(){writes++;throw new Error('unexpected');}}:{}});
 const result=await module.exports.POST(new Request('http://test/api/generated-stories',{method:'POST'}));
 assert.equal(result.status,401);assert.equal(writes,0);
});
