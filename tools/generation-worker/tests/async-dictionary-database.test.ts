import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isolatedDatabase} from './database.mjs';

async function fixture(commit=true,tts=false){
 const db=await isolatedDatabase({includeAssets:true});
 async function rpc(name:string,args:Record<string,unknown>={}){const entries=Object.entries(args);return (await db.query(`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v))).rows[0].result;}
 const user=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[user]);
 await rpc('grant_credits',{p_user_id:user,p_amount:100,p_source_type:'test',p_source_id:user,p_idempotency_key:`grant:${user}`});
 const row=(await db.query(`select * from public.create_generated_story_job($1,'en','B1','Library',$4,$5,'test',$2,$3,'{}')`,[user,`request:${user}`,[{code:'scene_text',credits:20},...(tts?[{code:'scene_tts',credits:5}]:[])],tts?'every_scene':'off',tts?25:20])).rows[0];
 const claim=await rpc('edge_claim_generation_job',{p_job_id:row.job_id,p_owner:'fixture-primary'});
 const auth={p_job_id:row.job_id,p_owner:claim.lease.owner,p_epoch:claim.lease.epoch};
 await db.query("update public.generation_edge_state set phase='commit' where job_id=$1",[row.job_id]);
 const tokens=[{word:'Alice',reading:null,level:null,tier:'base',meaning:null,start:0,end:10},{word:' reads.',reading:null,level:null,tier:'base',meaning:null,start:10,end:20}];
 const text='Alice reads a mysterious letter in the library.';
 const input={title:'Library',text,textSegments:tokens,choices:['Read','Wait','Leave'].map(label=>({label,intent:label})),summary:'A letter',stateSnapshot:{},promptVersion:'test',modelMetadata:{},ttsDeferred:tts,enrichmentDeferred:true,enrichment:{scene:{text},fingerprint:{dictionaryVersion:'fixture',segmentationVersion:'segments-v1'},enrichmentProgress:{version:'fixture',input:JSON.stringify({text}),spans:tokens.map(t=>({word:t.word,base:true})),prepareCursor:text.length,resolved:[],entries:[],rendered:[],renderCursor:0}}};
 let commitResult; if(commit){commitResult=await rpc('edge_commit_generated_text',{...auth,p_input:input});assert.deepEqual(commitResult,tts?{jobId:row.job_id,revision:1,followups:[{jobId:row.job_id,revision:1,kind:'enrichment'}]}:{jobId:row.job_id,revision:1,kind:'enrichment'});}
 async function claimEnrich(){return (await rpc('enrichment_claim_job',{p_job_id:row.job_id,p_owner:crypto.randomUUID()})).lease;}
 function eauth(l:any){return {p_job_id:row.job_id,p_owner:l.owner,p_epoch:l.epoch};}
 async function state(){return (await db.query(`select j.status,r.settled_amount,(select count(*)::int from public.credit_ledger where reservation_id=r.id and entry_type='settle') settles,(select count(*)::int from public.story_nodes where created_by_job_id=j.id) nodes from public.generation_jobs j join public.credit_reservations r on r.id=j.reservation_id where j.id=$1`,[row.job_id])).rows[0];}
 return {db,rpc,row,auth,input,tokens,claimEnrich,eauth,state,commitResult};
}
test('atomic primary commit settles once, releases branch eligibility, and publishes independent enrichment',async()=>{
 const f=await fixture();try{
 assert.deepEqual(await f.state(),{status:'completed',settled_amount:20,settles:1,nodes:1});
 const pending=await f.rpc('enrichment_pending_jobs');assert.equal(pending.length,1);assert.equal(pending[0].kind,'enrichment');
 await assert.rejects(f.rpc('edge_commit_generated_text',{...f.auth,p_input:f.input}));assert.equal((await f.state()).settles,1);
 const choice=(await f.db.query('select id from public.story_choices where node_id=(select node_id from public.generation_jobs where id=$1) limit 1',[f.row.job_id])).rows[0].id;
 const user=(await f.db.query('select user_id from public.generation_jobs where id=$1',[f.row.job_id])).rows[0].user_id;
 await f.db.query(`select * from public.create_story_branch_job($1,$2,$3,20,'test',$4,$5,'{}')`,[user,f.row.story_id,choice,`branch:${crypto.randomUUID()}`,[{code:'scene_text',credits:20}]]);
 const l=await f.claimEnrich();assert.equal(l.enrichment,true);assert.equal(l.job.nodeText,f.input.text);
 await f.rpc('enrichment_fail_stage',{...f.eauth(l),p_code:'missing_dictionary',p_retryable:false});
 assert.equal((await f.state()).status,'completed');assert.equal((await f.state()).settles,1);
 assert.equal((await f.db.query('select model_metadata from public.story_nodes where created_by_job_id=$1',[f.row.job_id])).rows[0].model_metadata.enrichmentStatus,'failed');
 }finally{await f.db.close();}
});
test('completion overlays lexical fields only and refuses changed ordered words',async()=>{
 const f=await fixture();try{
 let l=await f.claimEnrich();await f.rpc('enrichment_checkpoint_stage',{...f.eauth(l),p_next:'gloss',p_output:{}});
 l=await f.claimEnrich();await f.rpc('enrichment_begin_stage',f.eauth(l));await assert.rejects(f.rpc('enrichment_begin_stage',f.eauth(l)));
 await f.rpc('enrichment_checkpoint_stage',{...f.eauth(l),p_next:'commit',p_output:{}});l=await f.claimEnrich();
 await assert.rejects(f.rpc('enrichment_commit',{...f.eauth(l),p_tokens:[...f.tokens].reverse()}),/segmentation_changed/);
 await assert.rejects(f.rpc('enrichment_commit',{...f.eauth(l),p_tokens:f.tokens.map(t=>({...t,tier:'learning',meaning:'meaning'}))}),/invalid_enrichment_tokens/);
 await assert.rejects(f.rpc('enrichment_commit',{...f.eauth(l),p_tokens:f.tokens.map(t=>({...t,tier:'normal',meaning:' '}))}),/invalid_enrichment_tokens/);
 await f.rpc('enrichment_commit',{...f.eauth(l),p_tokens:f.tokens.map(t=>({...t,meaning:'释义',reading:'reading',tier:'normal',start:999,end:999,foreignField:'bad'}))});
 const node=(await f.db.query('select * from public.story_nodes where created_by_job_id=$1',[f.row.job_id])).rows[0];
 assert.equal(node.text_segments[0].start,0);assert.equal(node.text_segments[1].end,20);assert.equal(node.text_segments[0].meaning,'释义');assert.equal(node.text_segments[0].foreignField,undefined);assert.equal(node.node_version,1);assert.equal(node.model_metadata.enrichmentStatus,'completed');
 assert.equal((await f.rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'fixture-replay'})).kind,'terminal');assert.equal((await f.state()).settles,1);
 }finally{await f.db.close();}
});
test('stale owners, revisions, text edits and ambiguous paid calls cannot overwrite or repeat work',async()=>{
 const f=await fixture();try{
 const first=await f.claimEnrich();await f.db.query("update public.generation_enrichment_jobs set lease_expires_at=now()-interval '1 second' where job_id=$1",[f.row.job_id]);await f.rpc('enrichment_recover_jobs');
 const next=await f.claimEnrich();assert.ok(next.epoch>first.epoch);await assert.rejects(f.rpc('enrichment_checkpoint_stage',{...f.eauth(first),p_next:'gloss',p_output:{}}));
 await f.rpc('enrichment_checkpoint_stage',{...f.eauth(next),p_next:'gloss',p_output:{}});
 await f.rpc('enrichment_mark_published',{p_job_id:f.row.job_id,p_revision:1});assert.equal((await f.rpc('enrichment_pending_jobs')).length,1);
 const paid=await f.claimEnrich();await f.rpc('enrichment_begin_stage',f.eauth(paid));
 await f.db.query("update public.generation_enrichment_jobs set lease_expires_at=now()-interval '1 second' where job_id=$1",[f.row.job_id]);await f.rpc('enrichment_recover_jobs');
 assert.equal((await f.rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'fixture-replay'})).kind,'terminal');assert.equal((await f.state()).status,'completed');
 }finally{await f.db.close();}
 const g=await fixture();try{
 const l=await g.claimEnrich();await g.rpc('enrichment_checkpoint_stage',{...g.eauth(l),p_next:'gloss',p_output:{}});const l2=await g.claimEnrich();await g.rpc('enrichment_checkpoint_stage',{...g.eauth(l2),p_next:'commit',p_output:{}});const l3=await g.claimEnrich();
 await g.db.query("update public.story_nodes set text='Newer edited text' where created_by_job_id=$1",[g.row.job_id]);await g.rpc('enrichment_commit',{...g.eauth(l3),p_tokens:g.tokens});
 assert.equal((await g.db.query('select status from public.generation_enrichment_jobs where job_id=$1',[g.row.job_id])).rows[0].status,'stale');assert.equal((await g.state()).settles,1);
 }finally{await g.db.close();}
});
test('lookup retries terminate after three failures without releasing settled primary credits',async()=>{
 const f=await fixture();try{
 for(let i=0;i<3;i++){const l=await f.claimEnrich();await f.rpc('enrichment_fail_stage',{...f.eauth(l),p_code:'lookup_unavailable',p_retryable:true});await f.db.query('update public.generation_enrichment_jobs set next_attempt_at=now() where job_id=$1',[f.row.job_id]);}
 assert.equal((await f.rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'fixture-replay'})).kind,'terminal');assert.deepEqual(await f.state(),{status:'completed',settled_amount:20,settles:1,nodes:1});
 const grants=(await f.db.query("select has_function_privilege('anon','public.enrichment_claim_job(uuid,text)','execute') anon,has_function_privilege('service_role','public.enrichment_wake(uuid,integer)','execute') helper")).rows[0];assert.deepEqual(grants,{anon:false,helper:false});
 }finally{await f.db.close();}
});
test('async readiness needs provider capability but not a ready dictionary',async()=>{
 const db=await isolatedDatabase({includeAssets:true});try{
 await db.exec(`update public.generation_backend_status set active=true,consumer_verified=true,checked_at=now(),dictionary_version='missing',capabilities='{"text_en":true,"async_dictionary":true}'; select public.ensure_generation_backend_ready('en','off');`);
 await assert.rejects(db.exec("select public.ensure_generation_backend_ready('zh','off')"),/generation_backend_unavailable/);
 await db.exec(`update public.generation_backend_status set capabilities='{"text_en":true,"async_dictionary":false}';`);
 await assert.rejects(db.exec("select public.ensure_generation_backend_ready('en','off')"),/generation_backend_unavailable/);
 await db.exec(`select public.edge_report_generation_readiness('missing','{"text_en":true,"async_dictionary":true}'); select public.ensure_generation_backend_ready('en','off');`);
 }finally{await db.close();}
});

test('preparation is bounded and cannot skip, rewrite, or commit incomplete skeletons',async()=>{
 const f=await fixture(false);try{
 await f.db.query("update public.generation_edge_state set phase='prepare',outputs=$2 where job_id=$1",[f.row.job_id,{scene:{text:f.input.text}}]);
 let auth=f.auth;
 async function checkpoint(preparation:any){await f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'prepare',p_output:{preparation}});const c=await f.rpc('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:crypto.randomUUID()});auth={p_job_id:f.row.job_id,p_owner:c.lease.owner,p_epoch:c.lease.epoch};}
 const initial={version:'segments-v1',cursor:0,spans:[],tokens:[],renderCursor:0};
 await assert.rejects(f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'prepare',p_output:{preparation:{...initial,cursor:1}}}));
 await checkpoint(initial);
 await assert.rejects(f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'commit',p_output:{initialTokens:[]}}));
 const prepared={...initial,cursor:f.input.text.length,spans:[{word:'Alice',base:true},{word:' reads.',base:true}]};await checkpoint(prepared);
 await assert.rejects(f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'prepare',p_output:{preparation:{...prepared,spans:[{word:'changed',base:true}]}}}));
 await checkpoint({...prepared,tokens:f.tokens,renderCursor:2});
 await f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'commit',p_output:{initialTokens:f.tokens}});
 const c=await f.rpc('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:crypto.randomUUID()});
 await f.rpc('edge_commit_generated_text',{p_job_id:f.row.job_id,p_owner:c.lease.owner,p_epoch:c.lease.epoch,p_input:f.input});assert.equal((await f.state()).settles,1);
 }finally{await f.db.close();}
});

test('mismatched async metadata rolls back primary node, choices and settlement atomically',async()=>{
 const f=await fixture(false);try{
 for(const mutation of [
  {scene:{text:'Different text'}},
  {fingerprint:{dictionaryVersion:'fixture',segmentationVersion:'wrong'}},
  {enrichmentProgress:{...f.input.enrichment.enrichmentProgress,version:'other'}},
  {enrichmentProgress:{...f.input.enrichment.enrichmentProgress,spans:[{word:'wrong',base:true}]}},
 ]){
  await assert.rejects(f.rpc('edge_commit_generated_text',{...f.auth,p_input:{...f.input,enrichment:{...f.input.enrichment,...mutation}}}));
  assert.equal((await f.state()).nodes,0);assert.equal((await f.state()).settles,0);
 }
 await f.rpc('edge_commit_generated_text',{...f.auth,p_input:f.input});assert.equal((await f.state()).settles,1);
 }finally{await f.db.close();}
});

test('async TTS commits expose both durable wakes and preserve audio and glossary in either completion order',async()=>{
 for(const audioFirst of [true,false]){
  const f=await fixture(true,true);try{
   assert.equal(f.commitResult.followups[0].kind,'enrichment');
   assert.equal((await f.rpc('edge_pending_generation_jobs')).length,1);assert.equal((await f.rpc('enrichment_pending_jobs')).length,1);
   const audioClaim=await f.rpc('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:'fixture-audio'});
   let l=await f.claimEnrich();await f.rpc('enrichment_checkpoint_stage',{...f.eauth(l),p_next:'gloss',p_output:{}});l=await f.claimEnrich();await f.rpc('enrichment_checkpoint_stage',{...f.eauth(l),p_next:'commit',p_output:{}});l=await f.claimEnrich();
   const timestamps=[{start:0,end:10},{start:10,end:20}];
   async function audio(){await f.rpc('edge_commit_generated_audio',{p_job_id:f.row.job_id,p_owner:audioClaim.lease.owner,p_epoch:audioClaim.lease.epoch,p_input:{provider:'fixture',voiceId:'voice',objectKey:'fixture.mp3',contentHash:'f'.repeat(64),durationMs:20,timestamps}});}
   async function gloss(){await f.rpc('enrichment_commit',{...f.eauth(l),p_tokens:f.tokens.map(t=>({...t,tier:'normal',meaning:'meaning',start:999,end:999}))});}
   if(audioFirst){await audio();await gloss();}else{await gloss();await audio();}
   const node=(await f.db.query('select * from public.story_nodes where created_by_job_id=$1',[f.row.job_id])).rows[0];
   assert.equal(node.model_metadata.enrichmentStatus,'completed');assert.equal(node.text_segments[0].meaning,'meaning');assert.equal(node.text_segments[0].start,0);
   const asset=(await f.db.query('select * from public.audio_assets where created_by_job_id=$1',[f.row.job_id])).rows[0];assert.equal(asset.node_id,node.id);assert.equal(asset.node_version,node.node_version);assert.deepEqual(asset.timestamps,timestamps);
   assert.equal((await f.state()).settled_amount,25);assert.equal((await f.state()).settles,2);assert.equal((await f.state()).nodes,1);assert.equal((await f.state()).status,'completed');
  }finally{await f.db.close();}
 }
});

test('SQL preparation length matches JavaScript trim and UTF-16 for emoji, astral CJK and whitespace',async()=>{
 const f=await fixture(false);try{
 const whitespace='\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF';
 const text=whitespace+'Alice reads 😀 𠮷 in the mysterious library.'+'\n\u00A0';
 for(const value of [text,'😀𠮷',whitespace,'', '\u0085x\u0085', '\u180Ex\u180E', '\u200Bx\u200B'])assert.equal(await f.rpc('enrichment_prepared_length',{p_text:value}),value.trim().length);
 await f.db.query("update public.generation_edge_state set phase='prepare',outputs=$2 where job_id=$1",[f.row.job_id,{scene:{text}}]);
 let auth=f.auth;
 async function checkpoint(preparation:any){await f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'prepare',p_output:{preparation}});const c=await f.rpc('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:crypto.randomUUID()});auth={p_job_id:f.row.job_id,p_owner:c.lease.owner,p_epoch:c.lease.epoch};}
 const initial={version:'segments-v1',cursor:0,spans:[],tokens:[],renderCursor:0};await checkpoint(initial);
 const words=['Alice reads ','😀',' ','𠮷',' in the mysterious library.'];const tokens=words.map(word=>({word,tier:'base',meaning:null,reading:null,level:null}));
 const prepared={...initial,cursor:text.trim().length,spans:words.map(word=>({word,base:true}))};await checkpoint(prepared);await checkpoint({...prepared,tokens,renderCursor:tokens.length});
 await f.rpc('edge_checkpoint_generation_stage',{...auth,p_next:'commit',p_output:{initialTokens:tokens}});const c=await f.rpc('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:crypto.randomUUID()});
 const enrichment={...f.input.enrichment,scene:{text},enrichmentProgress:{...f.input.enrichment.enrichmentProgress,input:JSON.stringify({text}),spans:prepared.spans,prepareCursor:text.trim().length}};
 await f.rpc('edge_commit_generated_text',{p_job_id:f.row.job_id,p_owner:c.lease.owner,p_epoch:c.lease.epoch,p_input:{...f.input,text,textSegments:tokens,enrichment}});
 assert.equal((await f.state()).settles,1);
 const grant=(await f.db.query("select has_function_privilege('service_role','public.enrichment_prepared_length(text)','execute') allowed")).rows[0];assert.equal(grant.allowed,false);
 }finally{await f.db.close();}
});

test('terminal enrichment removes redundant scene/checkpoint payloads; queued retries retain them',async()=>{
 for(const terminal of ['completed','failed','stale','recovered','claim-expired','claim-stale']){
  const f=await fixture();try{
   let l=await f.claimEnrich();
   await f.rpc('enrichment_fail_stage',{...f.eauth(l),p_code:'retryable_lookup',p_retryable:true});
   let row=(await f.db.query('select * from public.generation_enrichment_jobs where job_id=$1',[f.row.job_id])).rows[0];assert.equal(row.status,'queued');assert.ok(row.outputs.scene);assert.ok(row.job.nodeText);
   await f.db.query('update public.generation_enrichment_jobs set next_attempt_at=now() where job_id=$1',[f.row.job_id]);
   if(terminal==='claim-expired')await f.db.query("update public.generation_enrichment_jobs set expires_at=now()-interval '1 second' where job_id=$1",[f.row.job_id]);
   if(terminal==='claim-stale')await f.db.query('update public.story_nodes set node_version=node_version+1 where created_by_job_id=$1',[f.row.job_id]);
   if(terminal.startsWith('claim-'))await f.rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'fixture-expired'});
   else {
    l=await f.claimEnrich();
    if(terminal==='failed')await f.rpc('enrichment_fail_stage',{...f.eauth(l),p_code:'terminal',p_retryable:false});
    else if(terminal==='recovered'){
     await f.db.query("update public.generation_enrichment_jobs set expires_at=now()-interval '1 second' where job_id=$1",[f.row.job_id]);await f.rpc('enrichment_recover_jobs');
    }else{
     await f.rpc('enrichment_checkpoint_stage',{...f.eauth(l),p_next:'gloss',p_output:{}});l=await f.claimEnrich();await f.rpc('enrichment_checkpoint_stage',{...f.eauth(l),p_next:'commit',p_output:{}});l=await f.claimEnrich();
     if(terminal==='stale')await f.db.query('update public.story_nodes set node_version=node_version+1 where created_by_job_id=$1',[f.row.job_id]);
     await f.rpc('enrichment_commit',{...f.eauth(l),p_tokens:f.tokens});
    }
   }
   row=(await f.db.query('select * from public.generation_enrichment_jobs where job_id=$1',[f.row.job_id])).rows[0];assert.deepEqual(row.outputs,{});assert.deepEqual(row.job,{});assert.ok(row.text_hash);assert.ok(row.segmentation_hash);assert.ok(row.node_id);
   assert.equal((await f.rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'fixture-replay'})).kind,'terminal');
   const node=(await f.db.query('select text,text_segments from public.story_nodes where created_by_job_id=$1',[f.row.job_id])).rows[0];assert.equal(node.text,f.input.text);assert.deepEqual(node.text_segments,f.tokens);
  }finally{await f.db.close();}
 }
});
