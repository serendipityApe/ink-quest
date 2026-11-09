// Read-only deployment gates. Never moves keys, changes credits or calls a model.
import assert from 'node:assert/strict';
import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const ACCOUNT='fdfece8b5c135c21fa630440b8dbf2e4';
export const WORKER='inkquest-generation-worker';
export const QUEUE='171b807ab78842a49440bcd21c7d7e8e';
export const VERSION='lex-244056cfff1d40670ec63f7b';
export function checkSnapshot(s,phase){
  assert.ok(['before','after'].includes(phase),'invalid_phase');
  assert.deepEqual(s.dictionary,[{version:VERSION,ready:true,expected_rows:892057}],'dictionary_not_ready');
  assert.equal(s.counts.zh,121446);assert.equal(s.counts.en,770611);
  assert.equal(s.backend.length,1);assert.equal(s.backend[0].active,false);assert.equal(s.backend[0].consumer_verified,false);
  assert.deepEqual(s.jobs,[],'active_job_exists');
  assert.equal(s.publicUrls.enabled,false);assert.equal(s.publicUrls.previews_enabled,false);
  const b=Object.fromEntries(s.settings.bindings.map(x=>[x.name,x]));
  for(const name of ['OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY'])assert.equal(b[name]?.type,'secret_text',name+'_missing');
  for(const [name,value] of Object.entries({LLM_PROVIDER:'openai',OPENAI_MODEL:'gpt-6-luna',OPENAI_REASONING_EFFORT:'low',OPENAI_MAX_OUTPUT_TOKENS:'6000',GENERATION_DICTIONARY_VERSION:VERSION,GENERATION_ENABLED:phase==='before'?'false':'true'}))assert.equal(b[name]?.text,value,name+'_mismatch');
  assert.equal(s.queue.queue_name,'inkquest-generation');assert.equal(s.queue.queue_id,QUEUE);
  if(phase==='before'){
    assert.deepEqual(s.consumers,[]);assert.deepEqual(s.schedules,[]);assert.equal(b.GENERATION_QUEUE,undefined);
  }else{
    assert.equal(b.GENERATION_QUEUE?.type,'queue');assert.equal(b.GENERATION_QUEUE?.queue_name,'inkquest-generation');
    assert.equal(s.consumers.length,1);const c=s.consumers[0];assert.equal(c.script_name,WORKER);
    for(const [key,value] of Object.entries({batch_size:1,max_concurrency:1,max_retries:3,max_wait_time_ms:1000}))assert.equal(c.settings?.[key],value,'consumer_'+key);
    assert.equal(s.schedules.length,1);assert.equal(s.schedules[0].cron,'* * * * *');
  }
  return {phase,verified:true,dictionaryVersion:VERSION,rows:892057,backendActive:false,consumerVerified:false,consumerCount:s.consumers.length,cronCount:s.schedules.length,model:'gpt-6-luna'};
}
export async function inspect(phase){
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
  s.dictionary=await db('generation_dictionary_versions?version=eq.'+VERSION+'&select=version,ready,expected_rows');
  s.counts={};for(const language of ['zh','en'])s.counts[language]=await db('generation_dictionary_entries?version=eq.'+VERSION+'&language=eq.'+language+'&select=version',true);
  s.backend=await db('generation_backend_status?worker_name=eq.'+WORKER+'&select=active,consumer_verified');
  s.jobs=await db('generation_jobs?status=in.(queued,running,partial_success)&select=id&limit=1');
  s.settings=await cf('/workers/scripts/'+WORKER+'/settings');
  s.publicUrls=await cf('/workers/scripts/'+WORKER+'/subdomain');
  s.schedules=(await cf('/workers/scripts/'+WORKER+'/schedules')).schedules;
  s.queue=await cf('/queues/'+QUEUE);s.consumers=await cf('/queues/'+QUEUE+'/consumers');
  return checkSnapshot(s,phase);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const result=await inspect(process.argv[2]);
    const safe=JSON.stringify(result);console.log(safe);
    console.log('::notice title=Generation deployment gate::'+safe);
    if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,safe+'\n');
  }catch(e){
    // Never log raw responses or credential-bearing exception objects.
    console.error('::error title=Generation deployment stopped::'+(e instanceof assert.AssertionError?'configuration_or_readiness_mismatch':/^read_http_\d+$/.test(e.message)?e.message:'read_failed'));
    process.exitCode=1;
  }
}
