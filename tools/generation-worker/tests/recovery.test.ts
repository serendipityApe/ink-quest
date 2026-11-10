import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { isolatedDatabase } from "./database.mjs";
import { postgrestResponse } from "./postgrest.mjs";
import { SupabaseEdgeStore, StoreUnavailable } from "../src/store.js";
import { deliver, tick, type Services } from "../src/runner.js";
import type { Lease } from "../src/contracts.js";
import { LlmProviderError } from "../../story-pipeline/src/providers/llm/errors.js";

let db: Awaited<ReturnType<typeof isolatedDatabase>>;
test("claim and recovery take the billing advisory lock before the reservation row",async()=>{
  const sql=await readFile(new URL("../../../supabase/migrations/202611060001_edge_generation_worker.sql",import.meta.url),"utf8");
  for(const name of ["edge_claim_generation_job","edge_recover_generation_jobs"]){
    const body=sql.split(`create function public.${name}(`)[1].split("end $$;")[0];
    const advisory=body.indexOf("perform pg_advisory_xact_lock(hashtextextended(v_job.reservation_id::text,0))");
    const reservation=body.search(/select \* into v_res(?:ervation)? from public\.credit_reservations/);
    assert.ok(advisory>=0&&reservation>advisory,`${name}: preserve the shared billing lock order`);
  }
});
const originalFetch = globalThis.fetch;
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const entries = Object.entries(args);
  const sql = `select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(",")}) result`;
  return (await db.query(sql,entries.map(([,v])=>v))).rows[0].result;
}
before(async () => {
  db=await isolatedDatabase({includeAssets:true});
  await db.exec(`insert into public.generation_dictionary_versions(version,ready,expected_rows,sources) values('test-v1',false,2,'[]');
    insert into public.generation_dictionary_entries values('test-v1','en','library','/laɪbrəri/','["图书馆"]','B1'),
      ('test-v1','zh','图书馆',null,'["library"]','HSK 3');`);
  await rpc("verify_generation_dictionary",{p_version:"test-v1"});
  globalThis.fetch=async (url,request={})=>{
    assert.ok(String(url).startsWith("https://database.invalid/rest/v1/rpc/"),"External requests prohibited in recovery tests");
    try{
      const name=String(url).split("/").at(-1)!;
      return postgrestResponse(name,await rpc(name,JSON.parse(String(request.body))));
    }
    catch{return Response.json({error:"isolated_database_error"},{status:503});}
  };
});

test("definite rate-limit rejection retries with a not-before gate, preserving the plan checkpoint",async()=>{
  const f=await fixture();await f.run();
  const provider=f.s.provider;let reject=true;
  f.s.provider=()=>{const value=provider();return {...value,async writeScene(input){
    if(reject){reject=false;throw new LlmProviderError("Fixture rate limit",true,true);}return value.writeScene(input);
  }};};
  await f.run();const busy=await f.run();assert.equal(busy.status.acks,0);assert.ok(busy.status.retries[0]>0);
  await db.query("update public.generation_edge_state set next_attempt_at=now() where job_id=$1",[f.row.job_id]);
  await f.run();await f.drain();assert.equal((await f.state()).status,"completed");assert.equal((await f.state()).attempt,2);assert.equal(f.calls.plan,1);
});
test("a model configuration change between stages fails explicitly without mixing generations",async()=>{
  const f=await fixture();await f.run();const provider=f.s.provider;
  f.s.provider=()=>({...provider(),model:"different-model"});await f.run();
  assert.equal((await f.state()).status,"failed");assert.equal((await f.state()).available,1000);assert.equal(f.calls.write,0);
});
test("RPC helpers and dictionary data are unavailable to anonymous and authenticated clients",async()=>{
  const rows=(await db.query(`select has_function_privilege('anon','public.edge_claim_generation_job(uuid,text)','execute') anon_claim,
    has_function_privilege('authenticated','public.lookup_generation_dictionary(text,text[],text)','execute') authenticated_lookup,
    has_function_privilege('service_role','public.edge_abort_generation_job(uuid,text)','execute') service_abort`)).rows[0];
  assert.deepEqual(rows,{anon_claim:false,authenticated_lookup:false,service_abort:false});
});
test("safe rate-limit retries terminate at max attempts and release only once",async()=>{
  const f=await fixture();const provider=f.s.provider;
  f.s.provider=()=>({...provider(),async planStory(){f.calls.plan++;throw new LlmProviderError("Fixture rate limit",true,true);}});
  for(let i=0;i<3;i++){
    await db.query("update public.generation_edge_state set next_attempt_at=now() where job_id=$1",[f.row.job_id]);
    await f.run();
  }
  await f.run();const state=await f.state();assert.equal(state.status,"failed");assert.equal(state.attempt,3);assert.equal(state.releases,1);assert.equal(f.calls.plan,3);
});
test("third-attempt success followed by a lost next-stage message is recovered rather than failed",async()=>{
  const f=await fixture();await f.run();const provider=f.s.provider;let writeRequests=0;
  f.s.provider=()=>{const value=provider();return {...value,async writeScene(input){
    if(++writeRequests<=2)throw new LlmProviderError("Fixture rate limit",true,true);return value.writeScene(input);
  }};};
  for(let i=0;i<3;i++){
    await db.query("update public.generation_edge_state set next_attempt_at=now() where job_id=$1",[f.row.job_id]);
    await f.run();
  }
  assert.equal((await f.state()).attempt,3);assert.equal((await f.state()).stage,"edge_enrich");
  f.queued.length=0;
  await db.query("update public.job_outbox set status='published',published_at=now() where job_id=$1",[f.row.job_id]);
  await db.query("update public.generation_jobs set updated_at=now()-interval '6 minutes' where id=$1",[f.row.job_id]);
  await f.store.recover();assert.equal((await f.state()).status,"queued");assert.equal((await f.state()).releases,0);
  await tick(f.s);await f.drain();const state=await f.state();
  assert.equal(state.status,"completed");assert.equal(state.settles,1);assert.equal(state.releases,0);assert.equal(writeRequests,3);assert.equal(f.calls.plan,1);
});
test("permanent model schema failures do not inherit transport retry behavior",async()=>{
  const f=await fixture();const provider=f.s.provider;
  f.s.provider=()=>({...provider(),async planStory(){f.calls.plan++;throw new LlmProviderError("Fixture invalid schema",true);}});
  await f.run();await f.run();assert.equal((await f.state()).status,"failed");assert.equal(f.calls.plan,1);
});
test("queued cancellation and claiming have exclusive outcomes in either transaction order",async()=>{
  const canceled=await fixture();
  async function cancelIfQueued(f:Awaited<ReturnType<typeof fixture>>){
    return db.transaction(async tx=>{
      await tx.query("select id from public.generation_jobs where id=$1 for update",[f.row.job_id]);
      const changed=await tx.query("update public.generation_jobs set status='canceled' where id=$1 and status='queued' and attempt=0 returning id",[f.row.job_id]);
      if(!changed.rows.length)return false;
      await tx.query("select public.release_credit_reservation($1,'fixture cancel',$2)",[f.row.reservation_id,`cancel:${f.row.job_id}`]);return true;
    });
  }
  assert.equal(await cancelIfQueued(canceled),true);assert.equal((await canceled.run()).status.acks,1);assert.equal(canceled.calls.plan,0);assert.equal((await canceled.state()).releases,1);
  const claimed=await fixture();const lease=await claimed.lease();assert.equal(await cancelIfQueued(claimed),false);
  assert.equal((await claimed.state()).reserved,20);await claimed.store.fail(lease,"fixture_cleanup",false);
});
after(async()=>{globalThis.fetch=originalFetch;await db.close();});

async function fixture(tts=false,incrementalDictionary=false){
  const userId=crypto.randomUUID();
  await db.query("insert into auth.users(id) values($1)",[userId]);
  await rpc("grant_credits",{p_user_id:userId,p_amount:1000,p_source_type:"test",p_source_id:userId,p_idempotency_key:`grant:${userId}`});
  const result=await db.query(`select * from public.create_generated_story_job($1,'en','B1','A quiet library',$2,$3,'test',$4,$5,'{}')`,[
    userId,tts?"every_scene":"off",tts?25:20,`request:${crypto.randomUUID()}`,
    [{code:"scene_text",credits:20},...(tts?[{code:"scene_tts",credits:5}]:[])],
  ]);
  const row=result.rows[0];
  const store=new SupabaseEdgeStore("https://database.invalid","fixture-key");
  if(incrementalDictionary)store.lookup=async(_language,words,version)=>{assert.ok(words.length<=4);return {version,ready:true,entries:words.map(word=>({word,reading:null,candidates:["Fixture meaning"],level:null}))};};
  const queued:string[]=[];
  const calls={plan:0,write:0,gloss:0,audio:0};
  const s:Services={store,queue:{async send({jobId}){queued.push(jobId);}},dictionaryVersion:"test-v1",
    segmentChinese:text=>[text],incrementalDictionary,async preflight(){},
    provider:()=>({provider:"mock",model:"mock-v1",promptVersion:"test-v1",
      async planStory(){calls.plan++;return {title:"The Library",worldBible:{},characters:[],openingIntent:"Discover"};},
      async writeScene(){calls.write++;return {text:"Alice opens the library door. A mysterious letter waits beside a silver key on the wooden desk.",
        summary:"Alice finds a letter",plotWords:["letter"],choices:["Read","Listen","Leave"].map(label=>({label,intent:label,branchSeed:{}})),stateDelta:{}};},
      async resolveGlosses(input){calls.gloss++;return input.unresolvedTokenIndexes.map(tokenIndex=>({tokenIndex,meaning:"测试释义"}));},
    }),async audio(lease){calls.audio++;return {jobId:lease.job.jobId,leaseOwner:lease.owner,provider:"mock",voiceId:"test",objectKey:"fixture.mp3",contentHash:"f".repeat(64),
      durationMs:1000,timestamps:lease.job.textSegments!.map((_,i)=>({start:i*10,end:i*10+5}))};},
  };
  function message(){const status={acks:0,retries:[] as number[]};return {status,body:{jobId:row.job_id},ack(){status.acks++;},retry({delaySeconds}:{delaySeconds:number}){status.retries.push(delaySeconds);}};}
  async function run(){const m=message();await deliver(m,s);return m;}
  async function drain(){let iterations=0;while(queued.length){queued.shift();assert.ok(++iterations<40);await run();}}
  async function state(){return (await db.query(`select j.status,j.stage,j.attempt,r.status reservation_status,r.settled_amount,a.available,a.reserved,
    (select count(*)::integer from public.story_nodes where created_by_job_id=j.id) nodes,
    (select count(*)::integer from public.credit_ledger where reservation_id=r.id and entry_type='settle') settles,
    (select count(*)::integer from public.credit_ledger where reservation_id=r.id and entry_type='release') releases
    from public.generation_jobs j join public.credit_reservations r on r.id=j.reservation_id join public.credit_accounts a on a.user_id=j.user_id where j.id=$1`,[row.job_id])).rows[0];}
  async function lease(){const c=await store.claim(row.job_id,crypto.randomUUID());assert.equal(c.kind,"claimed");return (c as {kind:"claimed";lease:Lease}).lease;}
  async function expire(){await db.query("update public.generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[row.job_id]);}
  return {row,userId,store,s,queued,calls,message,run,drain,state,lease,expire};
}

test("database commit before enqueue is recovered through the durable outbox",async()=>{
  const f=await fixture();await tick(f.s);await f.drain();
  assert.deepEqual(f.calls,{plan:1,write:1,gloss:1,audio:0});
  assert.deepEqual(await f.state(),{status:"completed",stage:"completed",attempt:1,reservation_status:"settled",settled_amount:20,available:980,reserved:0,nodes:1,settles:1,releases:0});
});
test("queue send before outbox mark can duplicate delivery without duplicate model calls or capture",async()=>{
  const f=await fixture();const mark=f.store.published.bind(f.store);let lose=true;
  f.store.published=async item=>{if(lose){lose=false;throw new StoreUnavailable("lost before mark");}await mark(item);};
  await assert.rejects(tick(f.s));await tick(f.s);await f.drain();
  assert.equal(f.calls.plan,1);assert.equal(f.calls.write,1);assert.equal((await f.state()).settles,1);
});
test("successful model and committed checkpoint with lost response resumes the next phase",async()=>{
  const f=await fixture();const checkpoint=f.store.checkpoint.bind(f.store);let lose=true;
  f.store.checkpoint=async(...args)=>{const r=await checkpoint(...args);if(lose){lose=false;throw new StoreUnavailable("lost checkpoint response");}return r;};
  assert.equal((await f.run()).status.retries.length,1);await f.run();await f.drain();
  assert.equal(f.calls.plan,1);assert.equal((await f.state()).status,"completed");
});
test("model success before checkpoint is ambiguous after crash and fails without another paid call",async()=>{
  const f=await fixture();f.store.checkpoint=async()=>{throw new StoreUnavailable("crashed before checkpoint");};
  await f.run();await f.expire();await f.run();await f.run();
  const state=await f.state();assert.equal(state.status,"failed");assert.equal(state.available,1000);assert.equal(state.releases,1);assert.equal(f.calls.plan,1);
});
test("final commit response lost and duplicate delivery do not regenerate or settle twice",async()=>{
  const f=await fixture();const commit=f.store.commitText.bind(f.store);
  f.store.commitText=async(...args)=>{await commit(...args);throw new StoreUnavailable("lost commit response");};
  await f.run();await f.drain();await f.run();
  const state=await f.state();assert.equal(state.status,"completed");assert.equal(state.nodes,1);assert.equal(state.settles,1);assert.equal(f.calls.write,1);
});
test("final database commit before ACK survives an ACK crash",async()=>{
  const f=await fixture();await f.run();await f.run();await f.run();await f.run();
  const message=f.message();message.ack=()=>{throw new Error("consumer terminated before ACK");};await deliver(message,f.s);
  assert.equal(message.status.retries.length,1);await f.run();assert.equal((await f.state()).settles,1);assert.equal(f.calls.write,1);
});
test("A crashes and a redelivery 20s into a 600s lease requests a durable retry instead of ACK",async()=>{
  const f=await fixture();await rpc("claim_generation_job",{p_job_id:f.row.job_id,p_lease_owner:"original-worker-A",p_lease_seconds:600});
  await db.query("update public.generation_jobs set lease_expires_at=now()+interval '580 seconds' where id=$1",[f.row.job_id]);
  const message=await f.run();assert.equal(message.status.acks,0);assert.ok(message.status.retries[0]>=579);
  await f.expire();await f.store.recover();await f.run();await f.drain();assert.equal((await f.state()).status,"completed");
});
test("lease recovery fences old owners and old epochs for begin, checkpoint, commit and fail",async()=>{
  const f=await fixture();const a=await f.lease();await f.expire();await f.store.recover();const b=await f.lease();assert.ok(b.epoch>a.epoch);
  await assert.rejects(f.store.begin(a));await assert.rejects(f.store.checkpoint(a,"write",{}));
  await assert.rejects(f.store.fail(a,"stale",false));
  await assert.rejects(rpc("edge_commit_generated_text",{p_job_id:a.job.jobId,p_owner:a.owner,p_epoch:a.epoch,p_input:{}}));
  await assert.rejects(rpc("edge_commit_generated_audio",{p_job_id:a.job.jobId,p_owner:a.owner,p_epoch:a.epoch,p_input:{}}));
  await assert.rejects(f.store.begin({...b,epoch:a.epoch}));await f.store.fail(b,"fixture_cleanup",false);
});
test("a released or expired reservation cannot be captured after a claim",async()=>{
  const f=await fixture();const a=await f.lease();
  await db.query("update public.credit_reservations set expires_at=now()-interval '1 second' where id=$1",[f.row.reservation_id]);
  await f.store.recover();assert.equal((await f.state()).releases,1);
  await assert.rejects(f.store.begin(a));assert.equal((await f.run()).status.acks,1);assert.equal((await f.state()).settles,0);
});
test("already expired queued work fails and releases once before any model call",async()=>{
  const f=await fixture();await db.query("update public.credit_reservations set expires_at=now()-interval '1 second' where id=$1",[f.row.reservation_id]);
  await f.run();await f.store.recover();await f.run();assert.equal(f.calls.plan,0);assert.equal((await f.state()).releases,1);
});
test("lost failure transaction response is reconciled through authoritative terminal state",async()=>{
  const f=await fixture();f.s.preflight=async()=>{throw new Error("invalid configuration");};
  const fail=f.store.fail.bind(f.store);f.store.fail=async(...args)=>{await fail(...args);throw new StoreUnavailable("lost failure response");};
  assert.equal((await f.run()).status.retries.length,1);assert.equal((await f.run()).status.acks,1);assert.equal((await f.state()).releases,1);
});
test("TTS failure preserves committed text and releases only the unconsumed narration line",async()=>{
  const f=await fixture(true);f.s.audio=async()=>{f.calls.audio++;throw new Error("invalid narration boundaries");};
  await f.run();await f.drain();await f.run();const state=await f.state();
  assert.equal(state.status,"partial_success");assert.equal(state.nodes,1);assert.equal(state.available,980);assert.equal(state.reserved,0);
  assert.equal(state.settled_amount,20);assert.equal(state.settles,1);assert.equal(state.releases,1);assert.equal(f.calls.write,1);assert.equal(f.calls.audio,1);
});
test("TTS crash after request intent is recovered as explicit partial success, never rewriting text",async()=>{
  const f=await fixture(true);for(let i=0;i<5;i++)await f.run();
  const audioLease=await f.lease();assert.equal(audioLease.phase,"audio");await f.store.begin(audioLease);
  await f.expire();await f.store.recover();await f.run();const state=await f.state();
  assert.equal(state.status,"partial_success");assert.equal(state.settled_amount,20);assert.equal(state.releases,1);assert.equal(f.calls.write,1);
});
test("audio completion response lost settles text and audio exactly once",async()=>{
  const f=await fixture(true);const commit=f.store.commitAudio.bind(f.store);f.store.commitAudio=async(...args)=>{await commit(...args);throw new StoreUnavailable("lost audio commit response");};
  await f.run();await f.drain();await f.run();const state=await f.state();
  assert.equal(state.status,"completed");assert.equal(state.settled_amount,25);assert.equal(state.settles,2);assert.equal(state.releases,0);assert.equal(f.calls.audio,1);
});
test("old outbox publication cannot hide a newer phase wake-up",async()=>{
  const f=await fixture();const a=await f.lease();await f.store.begin(a);const first=await f.store.checkpoint(a,"write",{});
  const b=await f.lease();await f.store.begin(b);const second=await f.store.checkpoint(b,"enrich",{});assert.ok(second.revision>first.revision);
  await f.store.published(first);const pending=await f.store.pending();assert.ok(pending.some(row=>row.jobId===f.row.job_id&&row.revision===second.revision));
  await f.store.fail(await f.lease(),"fixture_cleanup",false);
});
test("queued work with a lost published message is recovered and cannot remain indefinitely dormant",async()=>{
  const f=await fixture();await db.query("update public.job_outbox set status='published',published_at=now() where job_id=$1",[f.row.job_id]);
  await db.query("update public.generation_jobs set updated_at=now()-interval '6 minutes' where id=$1",[f.row.job_id]);
  await f.store.recover();assert.ok((await f.store.pending()).some(row=>row.jobId===f.row.job_id));
  await f.run();await f.drain();assert.equal((await f.state()).status,"completed");
});
test("missing dictionary version is explicit and incomplete imports cannot be activated",async()=>{
  const f=await fixture();assert.equal((await f.store.lookup("en",["library"],"absent")).ready,false);
  await db.exec("insert into public.generation_dictionary_versions(version,expected_rows,sources) values('incomplete',5,'[]')");
  await assert.rejects(rpc("verify_generation_dictionary",{p_version:"incomplete"}));
  await f.store.fail(await f.lease(),"fixture_cleanup",false);
});

test("lost enrichment checkpoint response resumes its durable cursor without duplicate model work or settlement",async()=>{
 const f=await fixture(false,true);await f.run();f.queued.length=0;await f.run();f.queued.length=0;
 const transport=globalThis.fetch;let lost=true;let captured:Record<string,unknown>|undefined;
 globalThis.fetch=async(url,request={})=>{const response=await transport(url,request);if(lost&&String(url).endsWith('/edge_checkpoint_enrichment_step')){lost=false;captured=JSON.parse(String(request.body));throw Error('response lost after commit');}return response;};
 try{const first=await f.run();assert.equal(first.status.acks,0);assert.deepEqual(first.status.retries,[30]);}finally{globalThis.fetch=transport;}
 const progress=(await db.query("select outputs->'enrichmentProgress' progress from public.generation_edge_state where job_id=$1",[f.row.job_id])).rows[0].progress;
 assert.deepEqual(progress.resolved,[]);await assert.rejects(rpc('edge_checkpoint_enrichment_step',captured!),/fenced/);
 await tick(f.s);await f.drain();const state=await f.state();assert.equal(state.status,'completed');assert.equal(state.settles,1);assert.equal(state.releases,0);assert.equal(state.nodes,1);assert.equal(state.available,980);assert.equal(state.reserved,0);assert.equal(f.calls.plan,1);assert.equal(f.calls.write,1);assert.equal(f.calls.gloss,0);
});
test("temporary missing asset retries a pure enrichment step and preserves the same reservation",async()=>{
 const f=await fixture(false,true);await f.run();f.queued.length=0;await f.run();f.queued.length=0;await f.run();f.queued.length=0;
 const lookup=f.store.lookup.bind(f.store);let unavailable=true;
 f.store.lookup=async(...args)=>{if(unavailable){unavailable=false;throw new StoreUnavailable('missing fixture shard');}return lookup(...args);};
 const failed=await f.run();assert.deepEqual(failed.status.retries,[30]);assert.equal((await f.state()).reserved,20);
 await f.expire();await f.run();await f.drain();await f.run();
 const state=await f.state();assert.equal(state.status,'completed');assert.equal(state.settles,1);assert.equal(state.releases,0);assert.equal(state.available,980);assert.equal(f.calls.plan,1);assert.equal(f.calls.write,1);
});
test("wrong dictionary version terminates enrichment and releases credit only once",async()=>{
 const f=await fixture(false,true);await f.run();f.queued.length=0;await f.run();f.queued.length=0;await f.run();f.queued.length=0;
 f.store.lookup=async()=>({version:'wrong',ready:true,entries:[]});await f.run();await f.run();
 const state=await f.state();assert.equal(state.status,'failed');assert.equal(state.releases,1);assert.equal(state.settles,0);assert.equal(state.available,1000);assert.equal(state.reserved,0);assert.equal(state.nodes,0);assert.equal(f.calls.plan,1);assert.equal(f.calls.write,1);
});

test("owned enrichment steps reject malformed, skipped and rewritten progress",async()=>{
 const f=await fixture(false,true);await f.run();f.queued.length=0;await f.run();f.queued.length=0;await f.run();f.queued.length=0;
 let lease=await f.lease();const original=lease.outputs.enrichmentProgress!;
 const args=(p_progress:unknown)=>({p_job_id:f.row.job_id,p_owner:lease.owner,p_epoch:lease.epoch,p_progress});
 for(const invalid of [null,{}, {...original,resolved:[]},{...original,resolved:['x'],version:'changed'},{...original,resolved:Array.from({length:17},(_,i)=>String(i))},{...original,resolved:['x','x']}])await assert.rejects(rpc('edge_checkpoint_enrichment_step',args(invalid)),/invalid_enrichment/);
 const first={...original,resolved:['word0']};await rpc('edge_checkpoint_enrichment_step',args(first));lease=await f.lease();
 await assert.rejects(rpc('edge_checkpoint_enrichment_step',args({...first,resolved:['rewritten','word1']})),/prefix_changed/);
 await f.store.fail(lease,'fixture_cleanup',false);assert.equal((await f.state()).releases,1);
});
