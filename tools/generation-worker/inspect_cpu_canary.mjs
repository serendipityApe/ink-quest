// Read only the already-created isolated canary; never sends another message.
import {appendFile} from "node:fs/promises";
const ACCOUNT="fdfece8b5c135c21fa630440b8dbf2e4",WORKER="inkquest-generation-cpu-canary";
const QUEUE_ID="f5408177e3c3462fac2746874902f80d";
const report={observedAt:new Date().toISOString(),worker:WORKER,queueId:QUEUE_ID,mutations:0,messagesSent:0,completed:[],stopped:null};
class Stop extends Error{}
async function read(action,path,body){
  let response;
  try{response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{
    method:body?"POST":"GET",redirect:"manual",signal:AbortSignal.timeout(30_000),
    headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,...(body?{"Content-Type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined});}
  catch{report.stopped={action,reason:"transport_failure",denied:false};throw new Stop();}
  let data;try{data=await response.json();}catch{report.stopped={action,reason:"invalid_response",httpStatus:response.status};throw new Stop();}
  if(!response.ok||data.success!==true){report.stopped={action,httpStatus:response.status,
    denied:[401,403].includes(response.status),errorCodes:(data.errors??[]).map(e=>e.code).filter(Number.isInteger)};throw new Stop();}
  report.completed.push(action);return data.result;
}
function fixture(value){
  if(typeof value==="string"){try{return fixture(JSON.parse(value));}catch{return null;}}
  if(!value||typeof value!=="object")return null;
  if(value.event==="generation_cpu_canary")return {caseId:value.caseId,tokens:value.tokens,wasmMemoryBytes:value.wasmMemoryBytes,networkCalls:value.networkCalls};
  for(const v of Object.values(value)){const found=fixture(v);if(found)return found;}
  return null;
}
try{
  if(process.env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||!process.env.CLOUDFLARE_API_TOKEN)throw new Error("Local validation failed");
  const queue=await read("isolated_queue_details",`/queues/${QUEUE_ID}`);
  report.queue={name:queue.queue_name,consumers:queue.consumers_total_count??queue.consumers?.length??null,
    settings:queue.settings,consumerSettings:(queue.consumers??[]).map(c=>({script:c.script_name,type:c.type,settings:c.settings}))};
  report.metrics=await read("isolated_queue_metrics",`/queues/${QUEUE_ID}/metrics`);
  report.publicUrls=await read("isolated_subdomain",`/workers/scripts/${WORKER}/subdomain`);
  const settings=await read("isolated_worker_settings",`/workers/scripts/${WORKER}/settings`);
  report.workerSettings={observability:settings.observability,compatibilityDate:settings.compatibility_date,
    bindingTypes:(settings.bindings??[]).map(b=>b.type)};
  const from=Date.parse("2026-11-06T17:59:18.000Z"),to=Date.now();
  const filters=[{key:"$metadata.service",type:"string",operation:"eq",value:WORKER}];
  const keys=await read("canary_telemetry_keys","/workers/observability/telemetry/keys",{from,to,filters,limit:1000});
  report.telemetryKeys=(keys??[]).map(k=>({key:k.key,type:k.type}));
  const logs=await read("canary_telemetry_events","/workers/observability/telemetry/query",{
    queryId:"inkquest-isolated-canary-read-only",dry:true,view:"events",limit:100,timeframe:{from,to},parameters:{filters}});
  report.telemetryShape=Object.fromEntries(Object.entries(logs??{}).map(([k,v])=>[k,Array.isArray(v)?{kind:"array",length:v.length}:typeof v]));
  report.events=[];
  function visit(value){
    if(!value||typeof value!=="object")return;
    const w=value.$workers,m=value.$metadata;
    if(w?.scriptName===WORKER||m?.service===WORKER){
      report.events.push({requestId:w?.requestId??m?.requestId??null,eventType:w?.eventType??null,
        cpuTimeMs:w?.cpuTimeMs??null,wallTimeMs:w?.wallTimeMs??null,outcome:w?.outcome??null,
        scriptVersion:w?.scriptVersion?.id??null,workerFieldNames:Object.keys(w??{}),
        metadataFieldNames:Object.keys(m??{}),fixture:fixture(value.source)??fixture(m?.message)});
    }
    for(const v of Object.values(value))visit(v);
  }
  visit(logs);
  report.stopped={action:"read_only_inspection_complete",denied:false};
}catch(error){if(!(error instanceof Stop))report.stopped={action:"local_execution",reason:"unexpected_error",denied:false};}
const output=JSON.stringify(report,null,2);console.log(output);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Existing isolated canary inspection\n\n\`\`\`json\n${output}\n\`\`\`\n`);
const annotation=JSON.stringify(report).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
console.log(`::${report.stopped?.action==="read_only_inspection_complete"?"notice":"error"} title=Read-only isolated canary result::${annotation}`);
if(report.stopped?.action!=="read_only_inspection_complete")process.exitCode=report.stopped?.denied?2:1;
