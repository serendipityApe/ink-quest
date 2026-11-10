// Fixed one-shot experiment on the existing isolated Queue. No app credentials.
import {appendFile} from 'node:fs/promises';
const ACCOUNT='fdfece8b5c135c21fa630440b8dbf2e4',WORKER='inkquest-generation-cpu-canary',QUEUE='f5408177e3c3462fac2746874902f80d';
const VERSION='8552ec7f-f024-4c2f-a8f1-bce0ae840255';
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
async function observe(){return telemetry(await api('/workers/observability/telemetry/query',{queryId:'inkquest-static-dictionary-canary-v2',dry:true,view:'events',limit:200,timeframe:{from:Date.parse(report.startedAt)-86400000,to:Date.now()},parameters:{filters:[{key:'$metadata.service',type:'string',operation:'eq',value:WORKER}]}}));}
try{
 if(process.env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||!process.env.CLOUDFLARE_API_TOKEN)throw Error('existing_credentials_missing');
 if(process.argv.includes('--inspect')){report.mode='read_only_inspection';report.observed=await observe();report.completed=true;throw Error('inspection_complete');}
 const consumers=await api(`/queues/${QUEUE}/consumers`),c=consumers[0];
 if(consumers.length!==1||(c.script_name??c.script)!==WORKER||c.settings.batch_size!==1||c.settings.max_concurrency!==1||c.settings.max_retries!==0)throw Error('isolation_mismatch');
 const urls=await api(`/workers/scripts/${WORKER}/subdomain`);if(urls.enabled||urls.previews_enabled)throw Error('public_url_enabled');
 if((await observe()).length)throw Error('experiment_already_executed_no_more_messages');
 const before=await api(`/workers/scripts/${WORKER}/deployments`);report.previousVersions=before.deployments?.[0]?.versions;
 await api(`/workers/scripts/${WORKER}/deployments`,{strategy:'percentage',versions:[{version_id:VERSION,percentage:100}],annotations:{'workers/message':'Isolated lexical assets canary only'}});
 const settings=await api(`/workers/scripts/${WORKER}/settings`);
 if(settings.bindings.some(b=>!['ASSETS','DICTIONARY_VERSION','DICTIONARY_MANIFEST_SHA256'].includes(b.name)||b.type==='secret_text'))throw Error('unexpected_binding');
 for(const caseId of ['en4','zh4','ready','corrupt','missing']){
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
const safe=JSON.stringify(report);console.log(safe);console.log(`::${report.completed?'notice':'error'} title=Static dictionary isolated canary::${safe}`);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,safe+'\n');
if(!report.completed)process.exitCode=1;
