import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkSnapshot,VERSION,SOURCE,MANIFEST,READER,READER_VERSION,WORKER,QUEUE} from '../activation_checks.mjs';
function fixture(phase='before'){
  const vars={LLM_PROVIDER:'openai',OPENAI_MODEL:'gpt-6-luna',OPENAI_REASONING_EFFORT:'low',OPENAI_MAX_OUTPUT_TOKENS:'6000',GENERATION_DICTIONARY_VERSION:phase==='before'?SOURCE:VERSION,GENERATION_ENABLED:phase==='before'?'false':'true'};
  return {dictionary:[{asset_version:VERSION,source_version:SOURCE,manifest_sha256:MANIFEST,expected_rows:892057,zh_rows:121446,en_rows:770611,reader_worker:READER,reader_version:READER_VERSION,verified_at:'2026-11-10T00:00:00Z'}],sqlDictionary:[{version:SOURCE,ready:false,expected_rows:892057}],readerPublicUrls:{enabled:false,previews_enabled:false},readerRoutes:[],readerDomains:[],readerVersions:[{version_id:READER_VERSION,percentage:100}],readerWorkerFirst:true,counts:{zh:121446,en:770611},backend:[{active:false,consumer_verified:false}],jobs:[],publicUrls:{enabled:false,previews_enabled:false},
    settings:{bindings:[...Object.entries(vars).map(([name,text])=>({name,type:'plain_text',text})),...['OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(name=>({name,type:'secret_text'})),...(phase==='after'?[{name:'GENERATION_QUEUE',type:'queue',queue_name:'inkquest-generation'},{name:'DICTIONARY',type:'service',service:READER,entrypoint:'Dictionary'},{name:'GENERATION_DICTIONARY_SOURCE_VERSION',type:'plain_text',text:SOURCE},{name:'GENERATION_DICTIONARY_MANIFEST_SHA256',type:'plain_text',text:MANIFEST}]:[])]},
    queue:{queue_name:'inkquest-generation',queue_id:QUEUE},consumers:phase==='after'?[{script_name:WORKER,settings:{batch_size:1,max_concurrency:1,max_retries:3,max_wait_time_ms:1000}}]:[],schedules:phase==='after'?[{cron:'* * * * *'}]:[]};
}
test('deployment gates require complete dictionary and closed creation before and after',()=>{
  for(const phase of ['before','after']){
    assert.equal(checkSnapshot(fixture(phase),phase).verified,true);
    for(const mutate of [s=>s.dictionary[0].verified_at=null,s=>s.sqlDictionary[0].ready=true,s=>s.readerPublicUrls.enabled=true,s=>s.readerWorkerFirst=false,s=>s.readerVersions[0].version_id='unexpected',s=>s.counts.en--,s=>s.backend[0].active=true,s=>s.backend[0].consumer_verified=true,s=>s.jobs.push({id:'new-job'}),s=>s.settings.bindings.splice(s.settings.bindings.findIndex(b=>b.name==='OPENAI_API_KEY'),1),s=>s.publicUrls.enabled=true]){
      const s=fixture(phase);mutate(s);assert.throws(()=>checkSnapshot(s,phase));
    }
  }
});
test('activation refuses unexpected consumers, concurrency, schedules or queue',()=>{
  for(const mutate of [s=>s.consumers[0].settings.max_concurrency=2,s=>s.consumers[0].script_name='another-worker',s=>s.consumers.push(s.consumers[0]),s=>s.schedules=[],s=>s.queue.queue_id='other']){
    const s=fixture('after');mutate(s);assert.throws(()=>checkSnapshot(s,'after'));
  }
});

test('current API script field is accepted while conflicting consumer identities fail',()=>{
 const s=fixture('after');s.consumers[0].script=s.consumers[0].script_name;delete s.consumers[0].script_name;assert.equal(checkSnapshot(s,'after').verified,true);
 s.consumers[0].script='another-worker';assert.throws(()=>checkSnapshot(s,'after'));
 s.consumers[0].script_name=WORKER;assert.throws(()=>checkSnapshot(s,'after'));
});
