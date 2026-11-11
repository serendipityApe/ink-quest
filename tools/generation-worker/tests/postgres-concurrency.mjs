/** Real PostgreSQL sessions; run only against a fresh disposable inkquest_test DB. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

assert.ok(['127.0.0.1', '::1', 'localhost'].includes(process.env.PGHOST), 'PGHOST must explicitly name loopback');
assert.equal(process.env.PGDATABASE, 'inkquest_test', 'Only the disposable inkquest_test database is allowed');
assert.equal(process.env.PGUSER, 'postgres', 'Use the isolated service superuser');
assert.ok(process.env.PGPASSWORD, 'An explicit synthetic service password is required');
const sessions = new Set();
// Do not inherit connection services, production URLs, options, or password files.
const env = {PATH:process.env.PATH, PGHOST:process.env.PGHOST, PGPORT:process.env.PGPORT ?? '5432',
 PGDATABASE:'inkquest_test', PGUSER:'postgres', PGPASSWORD:process.env.PGPASSWORD,
 PGCONNECT_TIMEOUT:'5', PGOPTIONS:'-c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000'};
const quote = x => `'${String(x).replaceAll("'", "''")}'`;
const value = x => x === null ? 'null' : typeof x === 'object' ? `${quote(JSON.stringify(x))}::jsonb` : typeof x === 'number' || typeof x === 'boolean' ? String(x) : quote(x);
const rpc = (name,args={}) => `select public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${value(v)}`).join(',')});`;
class Session {
 constructor(){
  this.name=`inkquest-test-${randomUUID()}`;this.out='';this.err='';this.dead=false;
  this.child=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:{...env,PGAPPNAME:this.name},stdio:['pipe','pipe','pipe']});
  sessions.add(this);this.child.stdout.on('data',d=>this.out+=d);this.child.stderr.on('data',d=>this.err+=d);
  this.child.stdin.on('error',e=>{this.err+=e.message;this.dead=true;});
  this.child.on('error',e=>{this.err+=e.message;this.dead=true;});this.child.on('close',()=>{this.dead=true;sessions.delete(this);});
 }
 async sql(sql){
  const marker=`DONE_${randomUUID()}`, start=this.out.length;
  this.child.stdin.write(`${sql}\n\\echo ${marker}\n`);
  const deadline=Date.now()+20000;
  while(!this.out.slice(start).includes(marker)){
   if(this.dead)throw new Error(this.err || 'psql exited');
   if(Date.now()>deadline)throw new Error(`psql command timed out: ${this.name}`);
   await delay(10);
  }
  return this.out.slice(start,this.out.indexOf(marker,start)).trim();
 }
 close(){this.child.stdin.end();this.child.kill();sessions.delete(this);}
}
async function sql(query){const s=new Session();try{return await s.sql(query);}finally{s.close();}}
async function json(query){return JSON.parse(await sql(query));}
const call=(name,args)=>json(rpc(name,args));
async function blockedBy(waiter,holder){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  const blocked=await json(`select to_jsonb(exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name=${quote(waiter.name)} and h.application_name=${quote(holder.name)} and w.wait_event_type='Lock'));`);
  if(blocked)return;
  if(waiter.dead)throw new Error(`Contender exited before lock barrier: ${waiter.err}`);
  await delay(20);
 }
 throw new Error('Expected PostgreSQL lock barrier was not observed');
}
// Execute first change but withhold COMMIT. Prove the second connection is waiting
// on the first transaction before release. No sleep-based ordering assumptions.
async function overlap(firstSQL,secondSQL){
 const a=new Session(),b=new Session();
 try{
  const first=await a.sql(`begin; ${firstSQL}`);
  const pending=b.sql(secondSQL).then(result=>({ok:true,result}),error=>({ok:false,error}));
  await blockedBy(b,a);await a.sql('commit;');
  return {first,second:await pending};
 }finally{a.close();b.close();}
}
const passed=[];
async function check(name,fn){await fn();passed.push(name);console.log(JSON.stringify({test:name,status:'passed'}));}

async function bootstrap(){
 assert.equal(await json(`select to_jsonb(current_database()='inkquest_test' and session_user='postgres');`),true);
 assert.equal(await json(`select count(*)::int from pg_tables where schemaname not in ('pg_catalog','information_schema');`),0,'Refusing a nonempty database');
 await sql(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema extensions;
 create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql as 'select null::uuid';
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 for(const file of ['202608220001_generated_story_billing.sql','202608220002_generation_worker_rpc.sql',
 '202608230001_generated_story_tts.sql','202608230002_fix_generation_digest_search_path.sql',
 '202611060001_edge_generation_worker.sql','202611060002_generation_readiness.sql',
 '202611100001_asset_dictionary_generation.sql','202611100002_incremental_enrichment_preparation.sql','202611100003_async_dictionary_enrichment.sql']){
  if(file==='202611100003_async_dictionary_enrichment.sql'){
   // Reproduce Supabase's creator-level default grants before creating helpers.
   await sql(`alter default privileges for role postgres in schema public grant execute on functions to service_role;
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create function public.test_default_grant() returns integer language sql as 'select 1';
    revoke execute on function public.test_default_grant() from public;`);
  }
  await sql(await readFile(new URL(`../../../supabase/migrations/${file}`,import.meta.url),'utf8'));
 }
 // Freeze a genuinely in-progress legacy job before replacing the checkpoint RPC.
 const legacy=await preparationFixture(false);
 await sql(await readFile(new URL('../../../supabase/migrations/202611110004_combine_preparation_checkpoints.sql',import.meta.url),'utf8'));
 return legacy;
}
async function fixture({commit=true,tts=false}={}){
 const user=randomUUID();await sql(`insert into auth.users(id) values(${quote(user)});`);
 await sql(rpc('grant_credits',{p_user_id:user,p_amount:100,p_source_type:'test',p_source_id:user,p_idempotency_key:`grant:${user}`}));
 const costs=[{code:'scene_text',credits:20},...(tts?[{code:'scene_tts',credits:5}]:[])];
 const row=await json(`select row_to_json(j) from public.create_generated_story_job(${quote(user)},'en','B1','Library',${quote(tts?'every_scene':'off')},${tts?25:20},'test',${quote(`request:${user}`)},${value(costs)},'{}') j;`);
 const claim=await call('edge_claim_generation_job',{p_job_id:row.job_id,p_owner:'fixture-primary'});
 const auth={p_job_id:row.job_id,p_owner:claim.lease.owner,p_epoch:claim.lease.epoch};
 await sql(`update public.generation_edge_state set phase='commit' where job_id=${quote(row.job_id)};`);
 const text='Alice reads a mysterious letter in the library.';
 const tokens=[{word:'Alice',reading:null,level:null,tier:'base',meaning:null,start:0,end:10},{word:text.slice(5),reading:null,level:null,tier:'base',meaning:null,start:10,end:20}];
 const input={title:'Library',text,textSegments:tokens,choices:['Read','Wait','Leave'].map(label=>({label,intent:label})),summary:'A letter',stateSnapshot:{},promptVersion:'test',modelMetadata:{},ttsDeferred:tts,enrichmentDeferred:true,enrichment:{scene:{text},fingerprint:{dictionaryVersion:'fixture',segmentationVersion:'segments-v1'},enrichmentProgress:{version:'fixture',input:JSON.stringify({text}),spans:tokens.map(t=>({word:t.word,base:true})),prepareCursor:text.length,resolved:[],entries:[],rendered:[],renderCursor:0}}};
 const primary=rpc('edge_commit_generated_text',{...auth,p_input:input});
 if(commit)await sql(primary);
 const id=quote(row.job_id);
 const claimEnrich=()=>call('enrichment_claim_job',{p_job_id:row.job_id,p_owner:randomUUID()});
 const eauth=lease=>({p_job_id:row.job_id,p_owner:lease.owner,p_epoch:lease.epoch});
 async function commitLease(){let {lease}=await claimEnrich();for(const next of ['gloss','commit']){await sql(rpc('enrichment_checkpoint_stage',{...eauth(lease),p_next:next,p_output:{}}));({lease}=await claimEnrich());}return lease;}
 const lexical=tokens.map(t=>({...t,tier:'normal',meaning:'meaning',reading:'reading',start:999,end:999}));
 const gloss=lease=>rpc('enrichment_commit',{...eauth(lease),p_tokens:lexical});
 const node=()=>json(`select row_to_json(n) from public.story_nodes n where created_by_job_id=${id};`);
 const billing=()=>json(`select jsonb_build_object('status',j.status,'amount',r.settled_amount,'settles',(select count(*) from public.credit_ledger where reservation_id=r.id and entry_type='settle'),'nodes',(select count(*) from public.story_nodes where created_by_job_id=j.id)) from public.generation_jobs j join public.credit_reservations r on r.id=j.reservation_id where j.id=${id};`);
 const ledger=()=>json(`select jsonb_agg(to_jsonb(l) order by l.id) from public.credit_ledger l where user_id=${quote(user)};`);
 return {user,row,id,primary,auth,input,tokens,claimEnrich,eauth,commitLease,gloss,node,billing,ledger};
}
const emptyPreparation=()=>({version:'segments-v1',cursor:0,spans:[],tokens:[],renderCursor:0});
async function primaryLease(f){
 const {lease}=await call('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:randomUUID()});
 return {p_job_id:f.row.job_id,p_owner:lease.owner,p_epoch:lease.epoch};
}
const checkpoint=(auth,next,output)=>rpc('edge_checkpoint_generation_stage',{...auth,p_next:next,p_output:output});
async function preparationFixture(combined=true){
 const f=await fixture({commit:false});
 // Character-sized fixture spans leave exactly 64 tokens for the final batch.
 const text='Alice reads a mysterious letter in the library and quietly opens the ancient book.';
 f.tokens=Array.from(text,word=>({word,reading:null,level:null,tier:'base',meaning:null}));
 f.input={...f.input,text,textSegments:f.tokens,enrichment:{...f.input.enrichment,scene:{text},
  enrichmentProgress:{...f.input.enrichment.enrichmentProgress,input:JSON.stringify({text}),prepareCursor:text.length,spans:f.tokens.map(t=>({word:t.word,base:true}))}}};
 await sql(`update public.generation_edge_state set phase='write',outputs='{}' where job_id=${f.id};`);
 const initial=emptyPreparation();
 await sql(checkpoint(f.auth,'prepare',{scene:{text:f.input.text},...(combined?{preparation:initial}:{})}));
 let auth=await primaryLease(f);
 if(!combined){await sql(checkpoint(auth,'prepare',{preparation:initial}));auth=await primaryLease(f);}
 const scanned={...initial,cursor:f.input.text.length,spans:f.tokens.map(t=>({word:t.word,base:true}))};
 await sql(checkpoint(auth,'prepare',{preparation:scanned}));auth=await primaryLease(f);
 const partial={...scanned,tokens:f.tokens.slice(0,-64),renderCursor:f.tokens.length-64};
 await sql(checkpoint(auth,'prepare',{preparation:partial}));auth=await primaryLease(f);
 return {f,auth,partial,finished:{...scanned,tokens:f.tokens,renderCursor:f.tokens.length}};
}
try{
 const legacy=await bootstrap();
 await check('default function grants cannot expose private enrichment helpers',async()=>{
  // PUBLIC has no access to the probe, proving the service grant is explicit.
  assert.equal(await json(`select to_jsonb(has_function_privilege('service_role','public.test_default_grant()','execute'));`),true);
  const tableGrants=await json(`select jsonb_build_object(
   'select',has_table_privilege('service_role','public.generation_enrichment_jobs','SELECT'),
   'insert',has_table_privilege('service_role','public.generation_enrichment_jobs','INSERT'),
   'update',has_table_privilege('service_role','public.generation_enrichment_jobs','UPDATE'),
   'delete',has_table_privilege('service_role','public.generation_enrichment_jobs','DELETE'));`);
  assert.deepEqual(tableGrants,{select:true,insert:false,update:false,delete:false});
  const helpers=['enrichment_fence','enrichment_wake','enrichment_words','enrichment_node_status','enrichment_prepared_length','enrichment_lock_parent'];
  const rpcs=['enrichment_claim_job','enrichment_begin_stage','enrichment_checkpoint_stage','enrichment_fail_stage','enrichment_commit','enrichment_pending_jobs','enrichment_mark_published','enrichment_recover_jobs','enrichment_checkpoint_step'];
  const grants=await json(`select jsonb_agg(jsonb_build_object('name',p.proname,
   'service',has_function_privilege('service_role',p.oid,'execute'),
   'anon',has_function_privilege('anon',p.oid,'execute'),
   'authenticated',has_function_privilege('authenticated',p.oid,'execute')))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'enrichment_%';`);
  assert.deepEqual(grants.map(x=>x.name).sort(),[...helpers,...rpcs].sort());
  for(const grant of grants){
   assert.equal(grant.service,rpcs.includes(grant.name),grant.name);
   assert.equal(grant.anon,false,grant.name);assert.equal(grant.authenticated,false,grant.name);
  }
  const f=await fixture({commit:false});
  await assert.rejects(sql(`set role service_role; ${rpc('enrichment_lock_parent',{p_job_id:f.row.job_id})}`),/permission denied/);
  // SECURITY DEFINER RPCs must still invoke their private helpers and triggers.
  await sql(`set role service_role; ${f.primary}`);
  const claim=await json(`set role service_role; ${rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'privilege-test-owner'})}`);
  assert.equal(claim.kind,'claimed');
  await sql(`set role service_role; ${rpc('enrichment_fail_stage',{...f.eauth(claim.lease),p_code:'fixture_terminal',p_retryable:false})}`);
  assert.equal((await f.node()).model_metadata.enrichmentStatus,'failed');
  assert.deepEqual(await f.billing(),{status:'completed',amount:20,settles:1,nodes:1});
 });
 await check('combined initialization serializes duplicate checkpoints without billing',async()=>{
  const f=await fixture({commit:false});
  await sql(`update public.generation_edge_state set phase='write',outputs='{}' where job_id=${f.id};`);
  const command=checkpoint(f.auth,'prepare',{scene:{text:f.input.text},preparation:emptyPreparation()});
  const before=await f.ledger();const {second}=await overlap(command,command);
  assert.equal(second.ok,false);assert.match(second.error.message,/generation_lease_fenced/);
  const state=await json(`select jsonb_build_object('phase',phase,'preparation',outputs->'preparation') from public.generation_edge_state where job_id=${f.id};`);
  assert.deepEqual(state,{phase:'prepare',preparation:emptyPreparation()});
  assert.deepEqual(await f.ledger(),before);assert.equal((await f.billing()).nodes,0);
 });
 await check('combined final checkpoint and primary commit each reject concurrent replay',async()=>{
  const {f,auth,finished}=await preparationFixture();const before=await f.ledger();
  const command=checkpoint(auth,'commit',{preparation:finished,initialTokens:f.tokens});
  const duplicate=await overlap(command,command);
  assert.equal(duplicate.second.ok,false);assert.match(duplicate.second.error.message,/generation_lease_fenced/);
  assert.deepEqual(await f.ledger(),before);
  const state=await json(`select jsonb_build_object('phase',phase,'preparation',outputs->'preparation','initialTokens',outputs->'initialTokens') from public.generation_edge_state where job_id=${f.id};`);
  assert.deepEqual(state,{phase:'commit',preparation:finished,initialTokens:f.tokens});
  const commit=rpc('edge_commit_generated_text',{...await primaryLease(f),p_input:f.input});
  const replay=await overlap(commit,commit);assert.equal(replay.second.ok,false);assert.match(replay.second.error.message,/generation_lease_fenced/);
  assert.deepEqual(await f.billing(),{status:'completed',amount:20,settles:1,nodes:1});
 });
 await check('combined final checkpoint fences old lease after concurrent replacement',async()=>{
  const {f,auth,partial,finished}=await preparationFixture();const before=await f.ledger();
  await sql(`update public.generation_jobs set lease_expires_at=now()-interval '1 second' where id=${f.id};`);
  const replacement=rpc('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:'combined-replacement'});
  const stale=checkpoint(auth,'commit',{preparation:finished,initialTokens:f.tokens});
  const result=await overlap(replacement,stale);assert.equal(result.second.ok,false);assert.match(result.second.error.message,/generation_lease_fenced/);
  const lease=JSON.parse(result.first).lease;assert.ok(lease.epoch>auth.p_epoch);
  assert.deepEqual(await json(`select outputs->'preparation' from public.generation_edge_state where job_id=${f.id};`),partial);
  assert.deepEqual(await f.ledger(),before);
  await sql(checkpoint({p_job_id:f.row.job_id,p_owner:lease.owner,p_epoch:lease.epoch},'commit',{preparation:finished,initialTokens:f.tokens}));
  await sql(rpc('edge_commit_generated_text',{...await primaryLease(f),p_input:f.input}));
  assert.deepEqual(await f.billing(),{status:'completed',amount:20,settles:1,nodes:1});
 });
 await check('in-progress pre-migration worker retains legacy checkpoint sequence',async()=>{
  const {f,auth,finished}=legacy;const before=await f.ledger();
  // This lease and partial token prefix were persisted under migration003.
  await sql(checkpoint(auth,'prepare',{preparation:finished}));
  const command=checkpoint(await primaryLease(f),'commit',{initialTokens:f.tokens});
  const {second}=await overlap(command,command);assert.equal(second.ok,false);assert.match(second.error.message,/generation_lease_fenced/);
  assert.deepEqual(await f.ledger(),before);
  await sql(rpc('edge_commit_generated_text',{...await primaryLease(f),p_input:f.input}));
  assert.deepEqual(await f.billing(),{status:'completed',amount:20,settles:1,nodes:1});
  assert.deepEqual((await f.node()).text_segments,f.tokens);
 });
 await check('duplicate primary commit serializes with one node and settlement',async()=>{
  const f=await fixture({commit:false});const {second}=await overlap(f.primary,f.primary);
  assert.equal(second.ok,false);assert.match(second.error.message,/generation_lease_fenced/);
  assert.deepEqual(await f.billing(),{status:'completed',amount:20,settles:1,nodes:1});
 });
 await check('concurrent enrichment claims elect exactly one owner',async()=>{
  const f=await fixture();const {first,second}=await overlap(rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'claim-owner-one'}),rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'claim-owner-two'}));
  assert.equal(JSON.parse(first).kind,'claimed');assert.equal(second.ok,true);assert.equal(JSON.parse(second.result).kind,'busy');
  assert.equal(await json(`select epoch::int from public.generation_enrichment_jobs where job_id=${f.id};`),1);
 });
 await check('lease epoch rejects a stale writer waiting on replacement lease',async()=>{
  const f=await fixture();const {lease:old}=await f.claimEnrich();
  await sql(`update public.generation_enrichment_jobs set lease_expires_at=now()-interval '1 second' where job_id=${f.id}; select public.enrichment_recover_jobs();`);
  const {first,second}=await overlap(rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'replacement-owner'}),rpc('enrichment_checkpoint_stage',{...f.eauth(old),p_next:'gloss',p_output:{}}));
  assert.ok(JSON.parse(first).lease.epoch>old.epoch);assert.equal(second.ok,false);assert.match(second.error.message,/enrichment_lease_fenced/);
  assert.equal(await json(`select to_jsonb(phase) from public.generation_enrichment_jobs where job_id=${f.id};`),'enrich');
 });
 await check('next branch can reserve while glossary remains pending',async()=>{
  const f=await fixture();const choice=await json(`select to_jsonb(id) from public.story_choices where node_id=(select node_id from public.generation_jobs where id=${f.id}) limit 1;`);
  await sql(`select * from public.create_story_branch_job(${quote(f.user)},${quote(f.row.story_id)},${quote(choice)},20,'test',${quote(randomUUID())},${value([{code:'scene_text',credits:20}])},'{}');`);
  assert.equal(await json(`select to_jsonb(status) from public.generation_enrichment_jobs where job_id=${f.id};`),'queued');
 });
 for(const audioFirst of [true,false])await check(`overlapping audio and glossary preserve both (${audioFirst?'audio':'glossary'} commits first)`,async()=>{
  const f=await fixture({tts:true});const lease=await f.commitLease();
  const audioClaim=await call('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:'fixture-audio'});
  const timestamps=[{start:0,end:10},{start:10,end:20}];
  const audio=rpc('edge_commit_generated_audio',{p_job_id:f.row.job_id,p_owner:audioClaim.lease.owner,p_epoch:audioClaim.lease.epoch,p_input:{provider:'fixture',voiceId:'voice',objectKey:'fixture.mp3',contentHash:'f'.repeat(64),durationMs:20,timestamps}});
  const gloss=f.gloss(lease);const {second}=await overlap(audioFirst?audio:gloss,audioFirst?gloss:audio);assert.equal(second.ok,true,second.error?.message);
  const node=await f.node();assert.equal(node.model_metadata.enrichmentStatus,'completed');assert.equal(node.text_segments[0].meaning,'meaning');assert.equal(node.text_segments[0].start,0);assert.equal(node.text_segments[1].end,20);
  const asset=await json(`select row_to_json(a) from public.audio_assets a where created_by_job_id=${f.id};`);
  assert.equal(asset.node_id,node.id);assert.equal(asset.node_version,node.node_version);assert.deepEqual(asset.timestamps,timestamps);
  assert.deepEqual(await f.billing(),{status:'completed',amount:25,settles:2,nodes:1});
  const before=await f.ledger();
  assert.deepEqual(before.filter(x=>x.entry_type==='settle').map(x=>({item:x.metadata.line_item,amount:x.amount})).sort((a,b)=>a.item.localeCompare(b.item)),[{item:'scene_text',amount:-20},{item:'scene_tts',amount:-5}]);
  await assert.rejects(sql(audio),/generation_lease_fenced/);await assert.rejects(sql(gloss),/enrichment_lease_fenced/);assert.deepEqual(await f.ledger(),before);
 });
 // Status updates also touch story_nodes through enrichment_node_status. Cover
 // these paths under the same audio locks, including recovery's nonblocking scan.
 for(const operation of ['claim','checkpoint','failure','recover-retry','recover-terminal']){
  for(const audioFirst of [true,false])await check(`audio/status overlap: ${operation}, ${audioFirst?'audio':'status'} first`,async()=>{
   const f=await fixture({tts:true});let action;let expected;
   if(operation==='claim'){
    action=rpc('enrichment_claim_job',{p_job_id:f.row.job_id,p_owner:'status-claim-owner'});expected='running';
   }else{
    let {lease}=await f.claimEnrich();
    if(operation==='checkpoint'){
     action=rpc('enrichment_checkpoint_stage',{...f.eauth(lease),p_next:'gloss',p_output:{}});expected='queued';
    }else if(operation==='failure'){
     action=rpc('enrichment_fail_stage',{...f.eauth(lease),p_code:'fixture_terminal',p_retryable:false});expected='failed';
    }else{
     if(operation==='recover-terminal'){
      await sql(rpc('enrichment_checkpoint_stage',{...f.eauth(lease),p_next:'gloss',p_output:{}}));
      ({lease}=await f.claimEnrich());await sql(rpc('enrichment_begin_stage',f.eauth(lease)));
     }
     await sql(`update public.generation_enrichment_jobs set lease_expires_at=now()-interval '1 second' where job_id=${f.id};`);
     action=rpc('enrichment_recover_jobs');expected=operation==='recover-terminal'?'failed':'queued';
    }
   }
   const audioClaim=await call('edge_claim_generation_job',{p_job_id:f.row.job_id,p_owner:'status-audio-owner'});
   const timestamps=[{start:0,end:10},{start:10,end:20}];
   const audio=rpc('edge_commit_generated_audio',{p_job_id:f.row.job_id,p_owner:audioClaim.lease.owner,p_epoch:audioClaim.lease.epoch,
    p_input:{provider:'fixture',voiceId:'voice',objectKey:'fixture.mp3',contentHash:'e'.repeat(64),durationMs:20,timestamps}});
   if(audioFirst && operation.startsWith('recover-')){
    const holder=new Session();
    try{
     await holder.sql(`begin; ${audio}`);
     // Recovery must return while the audio transaction still owns its lock,
     // skipping this job rather than waiting or taking an inverted row lock.
     await sql(`set statement_timeout='2s'; ${action}`);
     assert.equal(await json(`select to_jsonb(status) from public.generation_enrichment_jobs where job_id=${f.id};`),'running');
     await holder.sql('commit;');
    }finally{holder.close();}
    // Skipped work remains eligible and is processed after the lock is released.
    await sql(action);
   }else{
    const {second}=await overlap(audioFirst?audio:action,audioFirst?action:audio);
    assert.equal(second.ok,true,second.error?.message);
   }
   assert.equal(await json(`select to_jsonb(status) from public.generation_enrichment_jobs where job_id=${f.id};`),expected);
   const node=await f.node();assert.equal(node.model_metadata.enrichmentStatus,expected==='queued'?'pending':expected);
   assert.equal(node.text_segments[0].meaning,null);assert.equal(node.text_segments[0].start,0);
   const asset=await json(`select row_to_json(a) from public.audio_assets a where created_by_job_id=${f.id};`);
   assert.equal(asset.node_id,node.id);assert.deepEqual(asset.timestamps,timestamps);
   assert.deepEqual(await f.billing(),{status:'completed',amount:25,settles:2,nodes:1});
   const debits=(await f.ledger()).filter(x=>x.entry_type==='settle').map(x=>({item:x.metadata.line_item,amount:x.amount})).sort((a,b)=>a.item.localeCompare(b.item));
   assert.deepEqual(debits,[{item:'scene_text',amount:-20},{item:'scene_tts',amount:-5}]);
  });
 }
 await check('terminal failure and unknown paid outcome replay never alter billing',async()=>{
  for(const unknown of [false,true]){
   const f=await fixture();let {lease}=await f.claimEnrich();const before=await f.ledger();
   if(unknown){
    await sql(rpc('enrichment_checkpoint_stage',{...f.eauth(lease),p_next:'gloss',p_output:{}}));({lease}=await f.claimEnrich());
    await sql(rpc('enrichment_begin_stage',f.eauth(lease)));
    await sql(`update public.generation_enrichment_jobs set lease_expires_at=now()-interval '1 second' where job_id=${f.id}; select public.enrichment_recover_jobs();`);
   }else await sql(rpc('enrichment_fail_stage',{...f.eauth(lease),p_code:'missing_dictionary',p_retryable:false}));
   assert.equal((await f.claimEnrich()).kind,'terminal');await assert.rejects(sql(f.gloss(lease)),/enrichment_lease_fenced/);
   assert.deepEqual(await f.ledger(),before);assert.deepEqual(await f.billing(),{status:'completed',amount:20,settles:1,nodes:1});
   if(unknown)assert.equal(await json(`select to_jsonb(error_code) from public.generation_enrichment_jobs where job_id=${f.id};`),'upstream_outcome_unknown');
  }
 });
 await check('concurrent node rewrite fences blocked glossary overwrite',async()=>{
  const f=await fixture();const lease=await f.commitLease();const before=await f.ledger();
  const {second}=await overlap(`update public.story_nodes set text='Newer edited text',node_version=node_version+1 where created_by_job_id=${f.id};`,f.gloss(lease));
  assert.equal(second.ok,true,second.error?.message);const node=await f.node();assert.equal(node.text,'Newer edited text');assert.equal(node.text_segments[0].meaning,null);
  assert.equal(await json(`select to_jsonb(status) from public.generation_enrichment_jobs where job_id=${f.id};`),'stale');assert.deepEqual(await f.ledger(),before);
 });
 console.log(JSON.stringify({suite:'postgres-concurrency',status:'passed',tests:passed.length}));
}catch(error){console.error(JSON.stringify({suite:'postgres-concurrency',status:'failed',completed:passed,error:error.message}));process.exitCode=1;}
finally{for(const s of sessions)s.close();}
