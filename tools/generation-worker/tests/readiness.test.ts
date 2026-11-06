import assert from "node:assert/strict";
import {before,after,beforeEach,test} from "node:test";
import {isolatedDatabase} from "./database.mjs";
import {isGenerationBackendUnavailable} from "../../../src/lib/generation/readiness.js";
let db:Awaited<ReturnType<typeof isolatedDatabase>>;
async function rpc(name:string,args:Record<string,unknown>){
  const entries=Object.entries(args);
  if(name.startsWith("create_"))return (await db.query(`select * from public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(",")})`,entries.map(([,v])=>v))).rows;
  return (await db.query(`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(",")}) result`,entries.map(([,v])=>v))).rows[0].result;
}
before(async()=>{
  db=await isolatedDatabase();
  await db.exec("insert into public.generation_dictionary_versions(version,ready,expected_rows,sources) values('fixture-v1',true,2,'[]')");
});
after(async()=>{await db.close();});
beforeEach(async()=>{
  await db.exec(`update public.generation_backend_status set active=false,consumer_verified=false,checked_at=null,
    dictionary_version='fixture-v1',capabilities='{"text_zh":true,"text_en":true,"audio_zh":false,"audio_en":false}';
    update public.generation_dictionary_versions set ready=true where version='fixture-v1'`);
});
async function fixture(){
  const userId=crypto.randomUUID();await db.query("insert into auth.users(id) values($1)",[userId]);
  await rpc("grant_credits",{p_user_id:userId,p_amount:1000,p_source_type:"fixture",p_source_id:userId,p_idempotency_key:`grant:${userId}`});
  const args={p_user_id:userId,p_target_language:"en",p_learner_level:"B1",p_premise:"A quiet library",p_tts_mode:"off",
    p_quoted_amount:20,p_pricing_version:"fixture",p_idempotency_key:`request:${crypto.randomUUID()}`,p_items:[{code:"scene_text",credits:20}],p_input:{}};
  const account=async()=>(await db.query("select available,reserved from public.credit_accounts where user_id=$1",[userId])).rows[0];
  const create=()=>rpc("create_ready_generated_story_job",args);
  return {userId,args,account,create};
}
async function activate(){await db.exec("update public.generation_backend_status set active=true,consumer_verified=true,checked_at=now()");}
test("inactive, unverified or stale backend prevents opening reservation creation",async()=>{
  const f=await fixture();await assert.rejects(f.create(),/generation_backend_unavailable/);
  await db.exec("update public.generation_backend_status set active=true,checked_at=now()");
  await assert.rejects(f.create(),/generation_backend_unavailable/);
  await activate();await db.exec("update public.generation_backend_status set checked_at=now()-interval '4 minutes'");
  await assert.rejects(f.create(),/generation_backend_unavailable/);
  assert.deepEqual(await f.account(),{available:1000,reserved:0});
  assert.equal((await db.query("select count(*)::integer n from public.credit_reservations where user_id=$1",[f.userId])).rows[0].n,0);
});
test("dictionary and requested language/narration capability must be ready before reserving",async()=>{
  const f=await fixture();await activate();
  await db.exec("update public.generation_dictionary_versions set ready=false where version='fixture-v1'");
  await assert.rejects(f.create(),/generation_backend_unavailable/);
  await db.exec("update public.generation_dictionary_versions set ready=true where version='fixture-v1'");
  f.args.p_tts_mode="every_scene";await assert.rejects(f.create(),/generation_backend_unavailable/);
  f.args.p_tts_mode="off";await db.exec("update public.generation_backend_status set capabilities='{}'");
  await assert.rejects(f.create(),/generation_backend_unavailable/);
  assert.deepEqual(await f.account(),{available:1000,reserved:0});
});
test("heartbeat records capability without activating or verifying a consumer",async()=>{
  await rpc("edge_report_generation_readiness",{p_dictionary_version:"fixture-v1",p_capabilities:{text_en:true,text_zh:true,audio_en:false,audio_zh:false}});
  const status=(await db.query("select active,consumer_verified,checked_at is not null fresh from public.generation_backend_status")).rows[0];
  assert.deepEqual(status,{active:false,consumer_verified:false,fresh:true});
  const f=await fixture();await assert.rejects(f.create(),/generation_backend_unavailable/);
});
test("ready opening creation remains idempotent and reserves only once",async()=>{
  const f=await fixture();await activate();const first=await f.create();const second=await f.create();
  assert.equal(first[0].job_id,second[0].job_id);assert.equal(second[0].reused,true);
  assert.deepEqual(await f.account(),{available:980,reserved:20});
});
test("opening response loss replays the original job after readiness is paused",async()=>{
  const f=await fixture();await activate();const first=(await f.create())[0];
  await db.exec("update public.generation_backend_status set active=false,checked_at=now()-interval '4 minutes'");
  const replay=(await f.create())[0];assert.equal(replay.job_id,first.job_id);assert.equal(replay.reused,true);
  assert.deepEqual(await f.account(),{available:980,reserved:20});
  const other=await fixture();other.args.p_idempotency_key=f.args.p_idempotency_key;
  await assert.rejects(other.create(),/generation_backend_unavailable/);assert.deepEqual(await other.account(),{available:1000,reserved:0});
});
test("branch readiness failure leaves the choice and balance unchanged",async()=>{
  const f=await fixture();await activate();const created=(await f.create())[0];
  const owner="fixture-original-worker";
  await rpc("claim_generation_job",{p_job_id:created.job_id,p_lease_owner:owner,p_lease_seconds:600});
  await rpc("commit_generated_story_text",{p_job_id:created.job_id,p_lease_owner:owner,p_title:"The Library",
    p_text:"Alice opens the library door and discovers a mysterious letter.",p_text_segments:[{word:"Alice",tier:"key",meaning:"人名",reading:null,level:null}],
    p_choices:["Read","Listen","Leave"].map(label=>({label,intent:label,branch_seed:{}})),p_summary:"A letter",p_state_snapshot:{},p_prompt_version:"fixture",p_model_metadata:{},p_tts_deferred:false});
  const choice=(await db.query("select c.id from public.story_choices c join public.story_nodes n on n.id=c.node_id where n.created_by_job_id=$1 limit 1",[created.job_id])).rows[0];
  await db.exec("update public.generation_backend_status set active=false");
  const branchArgs={p_user_id:f.userId,p_story_id:created.story_id,p_choice_id:choice.id,
    p_quoted_amount:20,p_pricing_version:"fixture",p_idempotency_key:`branch:${created.job_id}`,p_items:[{code:"scene_text",credits:20}],p_input:{}};
  const branch=()=>rpc("create_ready_story_branch_job",branchArgs);
  await assert.rejects(branch(),/generation_backend_unavailable/);
  assert.deepEqual(await f.account(),{available:980,reserved:0});
  assert.equal((await db.query("select selected_at from public.story_choices where id=$1",[choice.id])).rows[0].selected_at,null);
  await activate();const first=(await branch())[0];assert.deepEqual(await f.account(),{available:960,reserved:20});
  await db.exec("update public.generation_backend_status set active=false,checked_at=now()-interval '4 minutes'");
  const replay=(await branch())[0];assert.equal(replay.job_id,first.job_id);assert.equal(replay.reused,true);
  assert.deepEqual(await f.account(),{available:960,reserved:20});
  await assert.rejects(rpc("create_ready_story_branch_job",{...branchArgs,p_story_id:crypto.randomUUID()}),/idempotency_conflict/);
  await assert.rejects(rpc("create_ready_story_branch_job",{...branchArgs,p_choice_id:crypto.randomUUID()}),/idempotency_conflict/);
});
test("anonymous and authenticated database roles cannot execute privileged creation or read backend state",async()=>{
  for(const role of ["anon","authenticated"]){
    await assert.rejects(db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);
      await tx.query("select * from public.create_ready_generated_story_job($1,'en','B1','fixture','off',20,'fixture','fixture-idempotency','[]','{}')",[crypto.randomUUID()]);
    }),/permission denied/);
    await assert.rejects(db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);
      await tx.query("select * from public.create_ready_story_branch_job($1,$2,$3,20,'fixture','fixture-idempotency','[]','{}')",[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()]);
    }),/permission denied/);
    await assert.rejects(db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);await tx.query("select * from public.generation_backend_status");
    }),/permission denied/);
  }
});
test("missing readiness RPC is classified as unavailable instead of creating legacy jobs",()=>{
  assert.equal(isGenerationBackendUnavailable({code:"PGRST202"}),true);
  assert.equal(isGenerationBackendUnavailable({message:"generation_backend_unavailable"}),true);
  assert.equal(isGenerationBackendUnavailable({message:"insufficient_credits"}),false);
});
