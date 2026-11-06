// One-shot, isolated Cloudflare control-plane experiment. Never loads app keys.
import {appendFile,readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {extractCanaryTelemetry} from "./canary_telemetry.mjs";

export const ACCOUNT="fdfece8b5c135c21fa630440b8dbf2e4";
export const WORKER="inkquest-generation-cpu-canary";
export const QUEUE="inkquest-generation-cpu-canary-20261106";
const CASES=["zh-short","zh-paragraph","zh-long","en-short","en-paragraph","en-long"];
class Stopped extends Error {}
export async function runCanary({token,account=ACCOUNT,request=fetch,read=readFile,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,onProgress=()=>{}}){
  const report={startedAt:new Date(now()).toISOString(),account:ACCOUNT,worker:WORKER,queue:QUEUE,
    planEvidence:"user-confirmed current Free plan screenshot; no billing API query",
    completed:[],messagesAccepted:0,samples:[],stopped:null};
  const root=new URL("./dist-canary/",import.meta.url);
  const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
  function stop(action,reason,extra={}){report.stopped={action,reason,...extra};throw new Stopped();}
  function progress(){onProgress(structuredClone(report));}
  async function api(action,path,method="GET",body){
    let response;
    try{response=await request(`${base}${path}`,{method,redirect:"manual",signal:AbortSignal.timeout(30_000),
      headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:body?{"Content-Type":"application/json"}:{})},
      body:body instanceof FormData?body:body?JSON.stringify(body):undefined});}
    catch{stop(action,"transport_failure",{denied:false,outcome:method==="GET"?"read_failed":"uncertain"});}
    let data;try{data=await response.json();}catch{stop(action,"invalid_response",{httpStatus:response.status,denied:false,outcome:method==="GET"?"read_failed":"uncertain"});}
    if(!response.ok||data.success===false){
      const denied=[401,403].includes(response.status);
      stop(action,denied?"access_denied":"api_error",{httpStatus:response.status,denied,
        errorCodes:(data.errors??[]).map(e=>e.code).filter(Number.isInteger),outcome:response.status>=500&&method!=="GET"?"uncertain":"rejected"});
    }
    if(data.success!==true)stop(action,"unconfirmed_response",{denied:false,outcome:method==="GET"?"read_failed":"uncertain"});
    report.completed.push(action);progress();return data;
  }
  try{
    if(account!==ACCOUNT||!token)stop("local_validation",!token?"existing_token_missing":"unexpected_account",{denied:false});
    // Read files before any mutation; no installs or package code with token.
    const script=await read(new URL("worker.js",root));
    const wasm=await read(new URL("jieba.wasm",root));
    const queues=[];let complete=false;
    for(let page=1;page<=5;page++){
      const data=await api("list_queues",`/queues?page=${page}&per_page=20`);
      if(!Array.isArray(data.result))stop("list_queues","unexpected_shape");
      queues.push(...data.result);
      if(page>=(data.result_info?.total_pages??1)){complete=true;break;}
    }
    if(!complete||queues.some(q=>q.queue_name===QUEUE))stop("isolation_check","inventory_incomplete_or_canary_already_exists");
    const production=queues.find(q=>q.queue_name==="inkquest-generation");
    report.productionConsumersBefore=production?.consumers_total_count??production?.consumers?.length??null;
    if(report.productionConsumersBefore!==0)stop("isolation_check","production_consumer_state_changed");
    const scripts=await api("list_worker_scripts","/workers/scripts");
    if(!Array.isArray(scripts.result)||scripts.result.some(s=>s.id===WORKER))stop("isolation_check","unexpected_or_existing_worker");
    const queue=await api("create_isolated_queue","/queues","POST",{queue_name:QUEUE});
    const id=queue.result?.queue_id;
    if(!/^[a-f0-9]{32}$/.test(id??""))stop("create_isolated_queue","missing_queue_id",{outcome:"uncertain"});
    report.queueId=id;
    const form=new FormData();
    form.set("metadata",new Blob([JSON.stringify({main_module:"worker.js",compatibility_date:"2026-07-21",
      bindings:[],observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,invocation_logs:true,head_sampling_rate:1}}})],{type:"application/json"}));
    form.set("worker.js",new Blob([script],{type:"application/javascript+module"}),"worker.js");
    form.set("jieba.wasm",new Blob([wasm],{type:"application/wasm"}),"jieba.wasm");
    const upload=await api("upload_isolated_worker",`/workers/scripts/${WORKER}`,"PUT",form);
    report.version=upload.result?.deployment_id??upload.result?.id??null;
    report.startupTimeMs=upload.result?.startup_time_ms??null;
    const subdomain=await api("disable_public_urls",`/workers/scripts/${WORKER}/subdomain`,"POST",{enabled:false,previews_enabled:false});
    if(subdomain.result?.enabled!==false||subdomain.result?.previews_enabled!==false)stop("disable_public_urls","not_confirmed_disabled");
    const consumer=await api("create_isolated_consumer",`/queues/${id}/consumers`,"POST",{type:"worker",script_name:WORKER,
      settings:{batch_size:1,max_concurrency:1,max_retries:0,max_wait_time_ms:1000}});
    const settings=consumer.result?.settings;
    if(consumer.result?.script_name!==WORKER||settings?.batch_size!==1||settings?.max_concurrency!==1||settings?.max_retries!==0)
      stop("create_isolated_consumer","settings_not_confirmed");
    // One outstanding fixed message at a time. Do not send the rest unless the
    // first invocation has provider CPU and a successful outcome.
    const seen=new Set();
    for(const caseId of CASES){
      const from=now()-1000;
      await api(`send_${caseId}`,`/queues/${id}/messages`,"POST",{body:{caseId},content_type:"json"});
      report.messagesAccepted++;progress();
      let sample=null;
      for(let attempt=0;attempt<8&&!sample;attempt++){
        await wait(10_000);
        const logs=await api("read_canary_cpu","/workers/observability/telemetry/query","POST",{
          queryId:"inkquest-generation-cpu-canary-once",dry:true,view:"events",limit:100,
          timeframe:{from,to:now()},parameters:{
            filters:[{key:"$metadata.service",type:"string",operation:"eq",value:WORKER}]}});
        const data=extractCanaryTelemetry(logs.result,WORKER);
        report.observedInvocationOutcomes=data.invocations;
        sample=data.samples.find(s=>s.caseId===caseId&&!seen.has(s.requestId))??null;
        if(sample)seen.add(sample.requestId);
      }
      if(!sample)stop("read_canary_cpu","provider_cpu_not_observed_no_more_messages",{denied:false});
      report.samples.push(sample);progress();
      if(sample.outcome!=="ok")stop("canary_execution","non_success_outcome_no_more_messages",{denied:false});
    }
    const metrics=await api("canary_queue_metrics",`/queues/${id}/metrics`);
    report.finalBacklog=metrics.result?.backlog_count??null;
    const cpu=report.samples.map(s=>s.cpuTimeMs).sort((a,b)=>a-b);
    report.cpuSummaryMs={median:(cpu[2]+cpu[3])/2,p95:cpu[Math.ceil(cpu.length*.95)-1],max:cpu.at(-1),count:cpu.length};
    report.stopped={action:"canary_complete",reason:"six_fixed_messages_measured",denied:false};
  }catch(error){if(!(error instanceof Stopped))report.stopped={action:"local_execution",reason:"unexpected_error",denied:false};}
  progress();return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  function publish(report){
    // Allowlisted metadata only: no raw responses, error strings or credentials.
    const safe=JSON.stringify(report);console.log(safe);
  }
  const report=await runCanary({token:process.env.CLOUDFLARE_API_TOKEN,account:process.env.CLOUDFLARE_ACCOUNT_ID,onProgress:publish});
  const output=JSON.stringify(report,null,2);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Isolated Free-plan canary\n\n\`\`\`json\n${output}\n\`\`\`\n`);
  const annotation=JSON.stringify(report).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
  console.log(`::${report.stopped?.action==="canary_complete"?"notice":"error"} title=Isolated canary result::${annotation}`);
  if(report.stopped?.action!=="canary_complete")process.exitCode=report.stopped?.denied?2:1;
}
