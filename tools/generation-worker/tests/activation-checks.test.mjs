import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkSnapshot,VERSION,WORKER,QUEUE} from '../activation_checks.mjs';
function fixture(phase='before'){
  const vars={LLM_PROVIDER:'openai',OPENAI_MODEL:'gpt-6-luna',OPENAI_REASONING_EFFORT:'low',OPENAI_MAX_OUTPUT_TOKENS:'6000',GENERATION_DICTIONARY_VERSION:VERSION,GENERATION_ENABLED:phase==='before'?'false':'true'};
  return {dictionary:[{version:VERSION,ready:true,expected_rows:892057}],counts:{zh:121446,en:770611},backend:[{active:false,consumer_verified:false}],jobs:[],publicUrls:{enabled:false,previews_enabled:false},
    settings:{bindings:[...Object.entries(vars).map(([name,text])=>({name,type:'plain_text',text})),...['OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(name=>({name,type:'secret_text'})),...(phase==='after'?[{name:'GENERATION_QUEUE',type:'queue',queue_name:'inkquest-generation'}]:[])]},
    queue:{queue_name:'inkquest-generation',queue_id:QUEUE},consumers:phase==='after'?[{script_name:WORKER,settings:{batch_size:1,max_concurrency:1,max_retries:3,max_wait_time_ms:1000}}]:[],schedules:phase==='after'?[{cron:'* * * * *'}]:[]};
}
test('deployment gates require complete dictionary and closed creation before and after',()=>{
  for(const phase of ['before','after']){
    assert.equal(checkSnapshot(fixture(phase),phase).verified,true);
    for(const mutate of [s=>s.dictionary[0].ready=false,s=>s.counts.en--,s=>s.backend[0].active=true,s=>s.backend[0].consumer_verified=true,s=>s.jobs.push({id:'new-job'}),s=>s.settings.bindings.splice(s.settings.bindings.findIndex(b=>b.name==='OPENAI_API_KEY'),1),s=>s.publicUrls.enabled=true]){
      const s=fixture(phase);mutate(s);assert.throws(()=>checkSnapshot(s,phase));
    }
  }
});
test('activation refuses unexpected consumers, concurrency, schedules or queue',()=>{
  for(const mutate of [s=>s.consumers[0].settings.max_concurrency=2,s=>s.consumers[0].script_name='another-worker',s=>s.consumers.push(s.consumers[0]),s=>s.schedules=[],s=>s.queue.queue_id='other']){
    const s=fixture('after');mutate(s);assert.throws(()=>checkSnapshot(s,'after'));
  }
});
