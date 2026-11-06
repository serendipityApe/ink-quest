// Continue the same deployment after read-only verification of its first sample.
// Exactly five remaining fixtures. No deployment, credential or resource changes.
import {appendFile} from "node:fs/promises";
import {extractCanaryTelemetry} from "./canary_telemetry.mjs";
const ACCOUNT="fdfece8b5c135c21fa630440b8dbf2e4",WORKER="inkquest-generation-cpu-canary";
const QUEUE="inkquest-generation-cpu-canary-20261106",ID="f5408177e3c3462fac2746874902f80d";
const VERSION="15257c85-76e5-46a8-8029-2ad7d3e0be84",START=Date.parse("2026-11-06T17:59:18.000Z");
const report={startedAt:new Date().toISOString(),worker:WORKER,queue:QUEUE,queueId:ID,version:VERSION,
  completed:[],additionalMessagesAccepted:0,totalExperimentMessagesAccepted:1,samples:[],stopped:null};
class Stop extends Error{}
function stop(action,reason,extra={}){report.stopped={action,reason,...extra};throw new Stop();}
async function api(action,path,body){
  let response;
  try{response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{
    method:body?"POST":"GET",redirect:"manual",signal:AbortSignal.timeout(30_000),
    headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,...(body?{"Content-Type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined});}
  catch{stop(action,"transport_failure",{outcome:action.startsWith("send_")?"uncertain":"read_failed",denied:false});}
  let data;try{data=await response.json();}catch{stop(action,"invalid_response",{httpStatus:response.status,denied:false});}
  if(!response.ok||data.success!==true)stop(action,"api_error",{httpStatus:response.status,
    denied:[401,403].includes(response.status),errorCodes:(data.errors??[]).map(e=>e.code).filter(Number.isInteger)});
  report.completed.push(action);return data.result;
}
async function observe(){
  const result=await api("read_existing_canary_cpu","/workers/observability/telemetry/query",{
    queryId:"inkquest-existing-canary-five-remaining",dry:true,view:"events",limit:200,
    timeframe:{from:START,to:Date.now()},parameters:{filters:[{key:"$metadata.service",type:"string",operation:"eq",value:WORKER}]}});
  return extractCanaryTelemetry(result,WORKER);
}
try{
  if(process.env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||!process.env.CLOUDFLARE_API_TOKEN)stop("local_validation","missing_existing_authorization");
  const q=await api("verify_isolated_queue",`/queues/${ID}`);
  if(q.queue_name!==QUEUE||(q.consumers_total_count??q.consumers?.length)!==1)stop("verify_isolated_queue","unexpected_queue_or_consumer_count");
  const consumers=await api("verify_isolated_consumer",`/queues/${ID}/consumers`);
  const c=Array.isArray(consumers)?consumers[0]:null;
  if(consumers?.length!==1||c.script_name!==WORKER||c.settings?.batch_size!==1||c.settings?.max_concurrency!==1||c.settings?.max_retries!==0)
    stop("verify_isolated_consumer","unexpected_consumer_configuration");
  const urls=await api("verify_no_public_urls",`/workers/scripts/${WORKER}/subdomain`);
  if(urls.enabled!==false||urls.previews_enabled!==false)stop("verify_no_public_urls","public_url_enabled");
  const settings=await api("verify_no_bindings",`/workers/scripts/${WORKER}/settings`);
  if(!Array.isArray(settings.bindings)||settings.bindings.length)stop("verify_no_bindings","unexpected_bindings");
  const deployments=await api("verify_deployed_version",`/workers/scripts/${WORKER}/deployments`);
  const versions=deployments.deployments?.[0]?.versions;
  if(versions?.length!==1||versions[0].version_id!==VERSION||versions[0].percentage!==100)stop("verify_deployed_version","unexpected_active_version");
  const initial=await observe(),first=initial.samples.find(s=>s.caseId==="zh-short"&&s.scriptVersion===VERSION&&s.outcome==="ok");
  if(!first)stop("verify_first_sample","successful_correlated_provider_cpu_missing");
  if(initial.invocations.length!==1||initial.samples.some(s=>s.caseId!=="zh-short"))
    stop("verify_first_sample","experiment_already_continued_or_unexpected_invocations_no_more_messages");
  report.samples.push(first);
  for(const caseId of ["zh-paragraph","zh-long","en-short","en-paragraph","en-long"]){
    await api(`send_${caseId}`,`/queues/${ID}/messages`,{body:{caseId},content_type:"json"});
    report.additionalMessagesAccepted++;report.totalExperimentMessagesAccepted++;
    let sample=null;
    for(let attempt=0;attempt<8&&!sample;attempt++){
      await new Promise(resolve=>setTimeout(resolve,10_000));
      const data=await observe();
      sample=data.samples.find(s=>s.caseId===caseId&&s.scriptVersion===VERSION)??null;
      report.observedInvocationOutcomes=data.invocations.map(i=>({requestId:i.requestId,outcome:i.outcome,cpuTimeMs:i.cpuTimeMs,scriptVersion:i.scriptVersion}));
    }
    if(!sample)stop("read_existing_canary_cpu","matching_cpu_missing_no_more_messages",{denied:false});
    report.samples.push(sample);
    if(sample.outcome!=="ok")stop("canary_execution","non_success_outcome_no_more_messages",{denied:false});
  }
  report.finalMetrics=await api("canary_queue_metrics",`/queues/${ID}/metrics`);
  const cpu=report.samples.map(s=>s.cpuTimeMs).sort((a,b)=>a-b);
  report.cpuSummaryMs={count:cpu.length,median:(cpu[2]+cpu[3])/2,p95:cpu[Math.ceil(cpu.length*.95)-1],max:cpu.at(-1)};
  report.stopped={action:"six_sample_experiment_complete",denied:false};
}catch(error){if(!(error instanceof Stop))report.stopped={action:"local_execution",reason:"unexpected_error",denied:false};}
const output=JSON.stringify(report,null,2);console.log(output);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Existing canary five remaining fixtures\n\n\`\`\`json\n${output}\n\`\`\`\n`);
const annotation=JSON.stringify(report).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
console.log(`::${report.stopped?.action==="six_sample_experiment_complete"?"notice":"error"} title=Bounded canary continuation result::${annotation}`);
if(report.stopped?.action!=="six_sample_experiment_complete")process.exitCode=report.stopped?.denied?2:1;
