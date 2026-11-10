// Read-only deployment gates. Never moves keys, changes credits or calls a model.
import assert from 'node:assert/strict';
import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const ACCOUNT='fdfece8b5c135c21fa630440b8dbf2e4';
export const WORKER='inkquest-generation-worker';
export const QUEUE='171b807ab78842a49440bcd21c7d7e8e';
export const SOURCE='lex-244056cfff1d40670ec63f7b';
export const VERSION='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a';
export const MANIFEST='6b262d70369aa45ced4c7150cf9bbf4759103884586ca14794422f9b59d54eeb';
export const READER='inkquest-dictionary-assets';
export const READER_VERSION='47b49ee7-7858-47d6-9373-504fd330f11a';
export function parseGateArgs(args){
  const [phase,...flags]=args;assert.ok(['before','after'].includes(phase),'invalid_phase');
  assert.ok(flags.every(x=>['--keep-active','--post-deploy'].includes(x))&&new Set(flags).size===flags.length,'invalid_gate_flags');
  const keepActive=flags.includes('--keep-active'),postDeploy=flags.includes('--post-deploy');
  assert.ok(!keepActive||phase==='after','keep_active_requires_after');assert.ok(!postDeploy||keepActive,'post_deploy_requires_keep_active');
  return {phase,options:{keepActive,postDeploy}};
}
export function gateArgsForRequest(request){return request?.mode==='compatible_latency_update'?['--keep-active']:[];}
export function checkSnapshot(s,phase,{keepActive=false,postDeploy=false,now=Date.now()}={}){
  assert.ok(['before','after'].includes(phase),'invalid_phase');
  assert.equal(typeof keepActive,'boolean');assert.equal(typeof postDeploy,'boolean');assert.ok(!keepActive||phase==='after','keep_active_requires_after');assert.ok(!postDeploy||keepActive,'post_deploy_requires_keep_active');
  assert.equal(s.dictionary.length,1);const asset=s.dictionary[0];
  for(const [key,value] of Object.entries({asset_version:VERSION,source_version:SOURCE,manifest_sha256:MANIFEST,expected_rows:892057,zh_rows:121446,en_rows:770611,reader_worker:READER,reader_version:READER_VERSION}))assert.equal(asset[key],value,'asset_'+key);
  assert.ok(asset.verified_at,'asset_not_verified');
  assert.deepEqual(s.sqlDictionary,[{version:SOURCE,ready:false,expected_rows:892057}],'partial_sql_dictionary_changed');
  assert.equal(s.readerPublicUrls.enabled,false);assert.equal(s.readerPublicUrls.previews_enabled,false);
  assert.deepEqual(s.readerRoutes,[]);assert.deepEqual(s.readerDomains,[]);
  assert.deepEqual(s.readerVersions,[{version_id:READER_VERSION,percentage:100}]);
  assert.equal(s.readerWorkerFirst,true,'asset_router_must_not_bypass_worker');
  assert.equal(s.counts.zh,121446);assert.equal(s.counts.en,770611);
  assert.equal(s.backend.length,1);const backend=s.backend[0];assert.equal(backend.active,keepActive);assert.equal(backend.consumer_verified,keepActive);
  if(keepActive){
    const checked=typeof backend.checked_at==='string'?Date.parse(backend.checked_at):NaN;
    assert.ok(Number.isFinite(now)&&Number.isFinite(checked)&&now-checked>=0&&now-checked<=180000,'stale_or_invalid_heartbeat');
    assert.equal(backend.dictionary_version,VERSION,'backend_dictionary_mismatch');
    assert.deepEqual(backend.capabilities,{text_en:true,text_zh:true,audio_en:false,audio_zh:false},'backend_capabilities_mismatch');
  }
  // A live entry cannot atomically exclude new jobs. Predeploy must be idle;
  // postdeploy reports any new job without falsely declaring deployment failure.
  assert.ok(Array.isArray(s.jobs));if(!postDeploy)assert.deepEqual(s.jobs,[],'active_job_exists');
  assert.equal(s.publicUrls.enabled,false);assert.equal(s.publicUrls.previews_enabled,false);
  const b=Object.fromEntries(s.settings.bindings.map(x=>[x.name,x]));
  for(const name of ['OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY'])assert.equal(b[name]?.type,'secret_text',name+'_missing');
  for(const [name,value] of Object.entries({LLM_PROVIDER:'openai',OPENAI_MODEL:'gpt-6-luna',OPENAI_REASONING_EFFORT:'low',OPENAI_MAX_OUTPUT_TOKENS:'6000',GENERATION_DICTIONARY_VERSION:phase==='before'?SOURCE:VERSION,GENERATION_ENABLED:phase==='before'?'false':'true'}))assert.equal(b[name]?.text,value,name+'_mismatch');
  assert.equal(s.queue.queue_name,'inkquest-generation');assert.equal(s.queue.queue_id,QUEUE);
  if(phase==='before'){
    assert.deepEqual(s.consumers,[]);assert.deepEqual(s.schedules,[]);assert.equal(b.GENERATION_QUEUE,undefined);
  }else{
    assert.equal(b.DICTIONARY?.type,'service');assert.equal(b.DICTIONARY?.service,READER);assert.equal(b.DICTIONARY?.entrypoint,'Dictionary');
    assert.equal(b.GENERATION_DICTIONARY_SOURCE_VERSION?.text,SOURCE);assert.equal(b.GENERATION_DICTIONARY_MANIFEST_SHA256?.text,MANIFEST);
    assert.equal(b.GENERATION_QUEUE?.type,'queue');assert.equal(b.GENERATION_QUEUE?.queue_name,'inkquest-generation');
    assert.equal(s.consumers.length,1);const c=s.consumers[0];assert.equal(c.script_name??c.script,WORKER);if(c.script_name&&c.script)assert.equal(c.script_name,c.script);
    for(const [key,value] of Object.entries({batch_size:1,max_concurrency:1,max_retries:3,max_wait_time_ms:1000}))assert.equal(c.settings?.[key],value,'consumer_'+key);
    assert.equal(s.schedules.length,1);assert.equal(s.schedules[0].cron,'* * * * *');
  }
  return {phase,verified:true,dictionaryVersion:VERSION,rows:892057,backendActive:backend.active,consumerVerified:backend.consumer_verified,...(keepActive?{keepActive:true,postDeploy,heartbeatAgeMs:now-Date.parse(backend.checked_at),activeJobObserved:s.jobs.length>0}:{}),consumerCount:s.consumers.length,cronCount:s.schedules.length,model:'gpt-6-luna'};
}
export async function inspect(phase,options={}){
  // Validate opt-in before any remote read. No state is changed by either mode.
  parseGateArgs([phase,...(options.keepActive?['--keep-active']:[]),...(options.postDeploy?['--post-deploy']:[])]);
  const cfToken=process.env.CLOUDFLARE_API_TOKEN,dbKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(cfToken&&dbKey,'existing_credentials_missing');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  async function read(url,headers,head=false){
    const r=await fetch(url,{method:head?'HEAD':'GET',redirect:'error',headers,signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw new Error('read_http_'+r.status);
    if(head){const n=r.headers.get('content-range')?.split('/').at(-1);assert.match(n??'',/^\d+$/);return Number(n);}
    return r.json();
  }
  async function cf(path){const d=await read('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{Authorization:'Bearer '+cfToken});assert.equal(d.success,true);return d.result;}
  const db=(path,head=false)=>read('https://irzfnntlixbtccdfjcpm.supabase.co/rest/v1/'+path,{apikey:dbKey,Authorization:'Bearer '+dbKey,...(head?{Prefer:'count=exact'}:{})},head);
  const s={}; // Sequential, stop on the first denied/failed read. No retries.
  s.dictionary=await db('generation_asset_dictionaries?asset_version=eq.'+VERSION+'&select=asset_version,source_version,manifest_sha256,expected_rows,zh_rows,en_rows,reader_worker,reader_version,verified_at');
  s.sqlDictionary=await db('generation_dictionary_versions?version=eq.'+SOURCE+'&select=version,ready,expected_rows');
  s.counts={zh:s.dictionary[0]?.zh_rows,en:s.dictionary[0]?.en_rows};
  s.readerPublicUrls=await cf('/workers/scripts/'+READER+'/subdomain');
  s.readerRoutes=await cf('/workers/services/'+READER+'/environments/production/routes?show_zonename=true');
  s.readerDomains=await cf('/workers/domains/records?page=0&per_page=5&service='+READER+'&environment=production');
  s.readerVersions=(await cf('/workers/scripts/'+READER+'/deployments')).deployments?.[0]?.versions;
  s.readerWorkerFirst=(await cf('/workers/scripts/'+READER+'/versions/'+READER_VERSION)).resources?.script_runtime?.assets?.raw_run_worker_first;
  s.backend=await db('generation_backend_status?worker_name=eq.'+WORKER+'&select=active,consumer_verified,checked_at,dictionary_version,capabilities');
  s.jobs=await db('generation_jobs?status=in.(queued,running,partial_success)&select=id&limit=1');
  s.settings=await cf('/workers/scripts/'+WORKER+'/settings');
  s.publicUrls=await cf('/workers/scripts/'+WORKER+'/subdomain');
  s.schedules=(await cf('/workers/scripts/'+WORKER+'/schedules')).schedules;
  s.queue=await cf('/queues/'+QUEUE);s.consumers=await cf('/queues/'+QUEUE+'/consumers');
  return checkSnapshot(s,phase,options);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const {phase,options}=parseGateArgs(process.argv.slice(2));
    const result=await inspect(phase,options);
    const safe=JSON.stringify(result);console.log(safe);
    console.log('::notice title=Generation deployment gate::'+safe);
    if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,safe+'\n');
  }catch(e){
    // Never log raw responses or credential-bearing exception objects.
    console.error('::error title=Generation deployment stopped::'+(e instanceof assert.AssertionError?'configuration_or_readiness_mismatch':/^read_http_\d+$/.test(e.message)?e.message:'read_failed'));
    process.exitCode=1;
  }
}
