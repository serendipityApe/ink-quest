// Fixed one-shot experiment on the existing isolated Queue. No app credentials.
import {appendFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ACCOUNT='fdfece8b5c135c21fa630440b8dbf2e4',WORKER='inkquest-generation-cpu-canary',QUEUE='f5408177e3c3462fac2746874902f80d';
const VERSION='32403031-632e-440b-bb9a-9d8dec31e465';
const report={startedAt:new Date().toISOString(),version:VERSION,samples:[],messagesAccepted:0,completed:false};
async function api(path,body){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const d=await r.json();if(!r.ok||d.success!==true)throw Error('api_'+r.status);return d.result;
}
function telemetry(data){
 const inv=new Map(),logs=new Map();
 function fixture(x){if(typeof x==='string'){try{return fixture(JSON.parse(x));}catch{return null;}}if(!x||typeof x!=='object')return null;if(x.event==='dictionary_asset_canary')return x;for(const v of Object.values(x)){const f=fixture(v);if(f)return f;}return null;}
 function visit(x){if(!x||typeof x!=='object')return;const w=x.$workers,m=x.$metadata,id=m?.requestId??w?.requestId;if(w?.scriptName===WORKER&&w.eventType==='queue'&&id){if(Number.isFinite(w.cpuTimeMs))inv.set(id,{requestId:id,cpuMs:w.cpuTimeMs,outcome:w.outcome,version:w.scriptVersion?.id});const f=fixture(x.source)??fixture(m?.message);if(f)logs.set(id,f);}for(const v of Object.values(x))visit(v);}
 visit(data);return [...inv.values()].filter(x=>x.version===VERSION).map(x=>({...x,fixture:logs.get(x.requestId)}));
}
async function observe(){return telemetry(await api('/workers/observability/telemetry/query',{queryId:'inkquest-static-dictionary-canary-v3-rpc-phases',dry:true,view:'events',limit:200,timeframe:{from:Date.parse(report.startedAt)-86400000,to:Date.now()},parameters:{filters:[{key:'$metadata.service',type:'string',operation:'eq',value:WORKER}]}}));}
try{
 if(process.env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||!process.env.CLOUDFLARE_API_TOKEN)throw Error('existing_credentials_missing');
 if(process.argv.includes('--production-inspect')){
  report.mode='read_only_production_inspection';let marker={};
  try{marker=JSON.parse(await readFile('.github/generation-worker-telemetry-request.json','utf8'));}catch{}
  const expectedHash=/^[a-f0-9]{64}$/.test(marker.jobHash??'')?marker.jobHash:null;
  const from=Number.isFinite(Date.parse(marker.from))?Date.parse(marker.from)-1000:Date.now()-1800000;
  const data=await api('/workers/observability/telemetry/query',{queryId:'inkquest-production-pipeline-readonly-20261110',dry:true,view:'events',limit:200,timeframe:{from,to:Date.now()},parameters:{filters:[{key:'$metadata.service',type:'string',operation:'eq',value:'inkquest-generation-worker'}]}});
  const inv=new Map(),phases=new Map(),usage=new Map();
  function audit(x){if(typeof x==='string'){try{return audit(JSON.parse(x));}catch{return null;}}if(!x||typeof x!=='object')return null;if(['generation_stage_timing','generation_llm_usage'].includes(x.event))return x;for(const v of Object.values(x)){const a=audit(v);if(a)return a;}return null;}
  function visit(x){if(!x||typeof x!=='object')return;const w=x.$workers,m=x.$metadata,id=m?.requestId??w?.requestId;
   if(w?.scriptName==='inkquest-generation-worker'&&id){
    if(Number.isFinite(w.cpuTimeMs))inv.set(id,{cpuMs:w.cpuTimeMs,outcome:w.outcome,eventType:w.eventType,version:w.scriptVersion?.id});
    const a=audit(x.source)??audit(m?.message);
    if(a?.event==='generation_stage_timing'&&expectedHash&&createHash('sha256').update(String(a.jobId)).digest('hex')===expectedHash)phases.set(id,{phase:a.phase,epoch:a.epoch,startedAt:a.startedAt,endedAt:a.endedAt,durationMs:a.durationMs,outcome:a.outcome});
    if(a?.event==='generation_llm_usage')usage.set(id,Object.fromEntries(['stage','model','startedAt','endedAt','durationMs','outcome','httpStatus','failureKind','responseStatus','inputTokens','cachedInputTokens','cacheWriteTokens','serviceTier','outputTokens','reasoningTokens','totalTokens'].map(k=>[k,a[k]])));
   }
   for(const v of Object.values(x))visit(v);
  }visit(data);
  report.productionSamples=[...inv.values()];report.testPhases=[...phases.values()].sort((a,b)=>a.epoch-b.epoch);report.testUsage=[...usage].filter(([id])=>phases.has(id)).map(([,v])=>v);
  console.log('::notice title=Production pipeline CPU telemetry::'+JSON.stringify({versions:[...new Set(report.productionSamples.map(x=>x.version))],samples:report.productionSamples.map(({cpuMs,outcome,eventType})=>({cpuMs,outcome,eventType}))}));
  for(let i=0;i<report.testPhases.length;i+=10)console.log('::notice title=Test stage timing '+(i/10+1)+'::'+JSON.stringify(report.testPhases.slice(i,i+10)));
  console.log('::notice title=Test model usage::'+JSON.stringify(report.testUsage));
  report.completed=true;throw Error('inspection_complete');
 }
 if(process.argv.includes('--inspect')){report.mode='read_only_inspection';report.observed=await observe();report.completed=true;throw Error('inspection_complete');}
 const consumers=await api(`/queues/${QUEUE}/consumers`),c=consumers[0];
 if(consumers.length!==1||(c.script_name??c.script)!==WORKER||c.settings.batch_size!==1||c.settings.max_concurrency!==1||c.settings.max_retries!==0)throw Error('isolation_mismatch');
 const urls=await api(`/workers/scripts/${WORKER}/subdomain`);if(urls.enabled||urls.previews_enabled)throw Error('public_url_enabled');
 if((await observe()).length)throw Error('experiment_already_executed_no_more_messages');
 const before=await api(`/workers/scripts/${WORKER}/deployments`);report.previousVersions=before.deployments?.[0]?.versions;
 await api(`/workers/scripts/${WORKER}/deployments`,{strategy:'percentage',versions:[{version_id:VERSION,percentage:100}],annotations:{'workers/message':'Isolated lexical assets canary only'}});
 const dictionaryUrls=await api('/workers/scripts/inkquest-dictionary-assets/subdomain');if(dictionaryUrls.enabled||dictionaryUrls.previews_enabled)throw Error('public_url_enabled');
 const dictionaryDeployments=await api('/workers/scripts/inkquest-dictionary-assets/deployments');report.dictionaryVersions=dictionaryDeployments.deployments?.[0]?.versions;
 if(report.dictionaryVersions?.length!==1||report.dictionaryVersions[0].version_id!=='47b49ee7-7858-47d6-9373-504fd330f11a')throw Error('isolation_mismatch');
 const settings=await api(`/workers/scripts/${WORKER}/settings`);
 if(settings.bindings.some(b=>!['ASSETS','DICTIONARY','GENERATION_DICTIONARY_VERSION','GENERATION_DICTIONARY_SOURCE_VERSION','GENERATION_DICTIONARY_MANIFEST_SHA256'].includes(b.name)||b.type==='secret_text'))throw Error('unexpected_binding');
 for(const caseId of ['lookup-distinct','prepare-en','prepare-zh','lookup-en','lookup-zh','render-en','render-zh','finish-en','finish-zh','invalid-version']){
  await api(`/queues/${QUEUE}/messages`,{body:{caseId},content_type:'json'});report.messagesAccepted++;
  let sample;
  for(let n=0;n<8&&!sample;n++){
   await new Promise(r=>setTimeout(r,10000));const seen=await observe();
   if(seen.some(x=>x.outcome!=='ok'||x.cpuMs>10)){report.observed=seen;throw Error('free_cpu_limit_not_met');}
   sample=seen.find(x=>x.fixture?.caseId===caseId);
  }
  if(!sample||!sample.fixture.verified||sample.cpuMs>10)throw Error('correlated_successful_cpu_missing');
  report.samples.push(sample);
 }
 report.completed=true;
}catch(e){if(e.message!=='inspection_complete')report.stopped=/^(api_\d+|existing_credentials_missing|isolation_mismatch|public_url_enabled|experiment_already_executed_no_more_messages|unexpected_binding|free_cpu_limit_not_met|correlated_successful_cpu_missing)$/.test(e.message)?e.message:'transport_or_unexpected_failure_no_retry';}
// Read-only RPC telemetry through the existing CI credential; never retry a denial.
try{
 const data=await api('/workers/observability/telemetry/query',{queryId:'inkquest-private-dictionary-rpc-readonly',dry:true,view:'events',limit:200,timeframe:{from:Date.parse(report.startedAt)-600000,to:Date.now()},parameters:{filters:[{key:'$metadata.service',type:'string',operation:'eq',value:'inkquest-dictionary-assets'}]}});
 const inv=new Map();function visit(x){if(!x||typeof x!=='object')return;const w=x.$workers,m=x.$metadata;if(w?.scriptName==='inkquest-dictionary-assets'&&Number.isFinite(w.cpuTimeMs))inv.set(m?.requestId??JSON.stringify(w),{cpuMs:w.cpuTimeMs,outcome:w.outcome,eventType:w.eventType,version:w.scriptVersion?.id});for(const v of Object.values(x))visit(v);}visit(data);
 report.readerSamples=[...inv.values()];
 console.log('::notice title=Private dictionary RPC telemetry::'+JSON.stringify({samples:report.readerSamples}));
}catch{report.readerTelemetry='unavailable_no_retry';}
const safe=JSON.stringify(report);console.log(safe);const unique=new Map([...(report.samples??[]),...(report.observed??[])].map(x=>[x.requestId,x]));
const compact={version:report.version,completed:report.completed,stopped:report.stopped,messagesAccepted:report.messagesAccepted,samples:[...unique.values()].map(x=>({caseId:x.fixture?.caseId,cpuMs:x.cpuMs,outcome:x.outcome,verified:x.fixture?.verified,rpcCalls:x.fixture?.rpcCalls,checkpointBytes:x.fixture?.checkpointBytes,wasmMemoryBytes:x.fixture?.wasmMemoryBytes}))};
console.log(`::${report.completed?'notice':'error'} title=Static dictionary isolated canary::${JSON.stringify(compact)}`);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,safe+'\n');
if(!report.completed)process.exitCode=1;
