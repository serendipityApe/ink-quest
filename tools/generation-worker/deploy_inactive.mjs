// Approved destination only. No Queue bindings/consumer, Cron or paid override.
import {appendFile,readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
export const ACCOUNT="fdfece8b5c135c21fa630440b8dbf2e4",WORKER="inkquest-generation-worker";
const SUPABASE_URL="https://irzfnntlixbtccdfjcpm.supabase.co";
class Stop extends Error{}
export async function deployInactive({token,serviceRole,account=ACCOUNT,request=fetch,read=readFile}){
 const report={startedAt:new Date().toISOString(),worker:WORKER,completed:[],supabaseSecretConfigured:false,
   generationEnabled:false,queueBindings:0,consumersConfigured:0,cronConfigured:0,stopped:null};
 function stop(action,reason,extra={}){report.stopped={action,reason,...extra};throw new Stop();}
 async function api(action,path,method="GET",body){
  let response;
  try{response=await request(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{
    method,redirect:"manual",signal:AbortSignal.timeout(30_000),headers:{Authorization:`Bearer ${token}`,
    ...(body instanceof FormData?{}:body?{"Content-Type":"application/json"}:{})},
    body:body instanceof FormData?body:body?JSON.stringify(body):undefined});}
  catch{stop(action,"transport_failure",{outcome:method==="GET"?"read_failed":"uncertain",denied:false});}
  let data;try{data=await response.json();}catch{stop(action,"invalid_response",{httpStatus:response.status,outcome:method==="GET"?"read_failed":"uncertain"});}
  if(!response.ok||data.success!==true)stop(action,"api_error",{httpStatus:response.status,denied:[401,403].includes(response.status),errorCodes:(data.errors??[]).map(e=>e.code).filter(Number.isInteger)});
  report.completed.push(action);return data.result;
 }
 try{
  if(account!==ACCOUNT||!token||!serviceRole)stop("local_validation","approved_existing_credentials_missing_or_wrong_account");
  const js=await read(new URL("./dist/worker.js",import.meta.url)),wasm=await read(new URL("./dist/jieba.wasm",import.meta.url));
  const scripts=await api("verify_target_not_preexisting","/workers/scripts");
  if(!Array.isArray(scripts)||scripts.some(s=>s.id===WORKER))stop("verify_target_not_preexisting","target_exists_or_inventory_invalid");
  const form=new FormData();
  form.set("metadata",new Blob([JSON.stringify({main_module:"worker.js",compatibility_date:"2026-07-21",
    bindings:[{type:"plain_text",name:"GENERATION_ENABLED",text:"false"},{type:"plain_text",name:"SUPABASE_URL",text:SUPABASE_URL},
      {type:"plain_text",name:"LLM_PROVIDER",text:"openai"}],observability:{enabled:true,head_sampling_rate:1}})],{type:"application/json"}));
  form.set("worker.js",new Blob([js],{type:"application/javascript+module"}),"worker.js");
  form.set("jieba.wasm",new Blob([wasm],{type:"application/wasm"}),"jieba.wasm");
  const upload=await api("deploy_disabled_worker",`/workers/scripts/${WORKER}`,"PUT",form);
  report.deploymentId=upload.deployment_id??upload.id??null;report.startupTimeMs=upload.startup_time_ms??null;
  const urls=await api("disable_public_urls",`/workers/scripts/${WORKER}/subdomain`,"POST",{enabled:false,previews_enabled:false});
  if(urls.enabled!==false||urls.previews_enabled!==false)stop("disable_public_urls","not_confirmed_disabled");
  await api("configure_approved_supabase_secret",`/workers/scripts/${WORKER}/secrets`,"PUT",{
    name:"SUPABASE_SERVICE_ROLE_KEY",type:"secret_text",text:serviceRole});
  report.supabaseSecretConfigured=true;
  const settings=await api("verify_disabled_worker_metadata",`/workers/scripts/${WORKER}/settings`);
  const bindings=settings.bindings??[];
  report.bindingMetadata=bindings.map(b=>({name:b.name,type:b.type}));
  if(bindings.find(b=>b.name==="GENERATION_ENABLED")?.text!=="false"||
    !bindings.some(b=>b.name==="SUPABASE_SERVICE_ROLE_KEY"&&b.type==="secret_text")||
    bindings.some(b=>b.type==="queue"||b.name==="OPENAI_API_KEY"||b.name==="AZURE_SPEECH_KEY"))
    stop("verify_disabled_worker_metadata","unexpected_binding_configuration");
  const schedules=await api("verify_no_recovery_cron",`/workers/scripts/${WORKER}/schedules`);
  if(!Array.isArray(schedules.schedules)||schedules.schedules.length)stop("verify_no_recovery_cron","cron_not_confirmed_absent");
  report.stopped={action:"disabled_worker_and_approved_supabase_secret_configured",denied:false};
 }catch(error){if(!(error instanceof Stop))report.stopped={action:"local_execution",reason:"unexpected_error",denied:false};}
 return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const report=await deployInactive({token:process.env.CLOUDFLARE_API_TOKEN,serviceRole:process.env.SUPABASE_SERVICE_ROLE_KEY,account:process.env.CLOUDFLARE_ACCOUNT_ID});
 const output=JSON.stringify(report,null,2);console.log(output);
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Disabled production generation Worker\n\n\`\`\`json\n${output}\n\`\`\`\n`);
 const annotation=JSON.stringify(report).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
 console.log(`::${report.stopped?.action==="disabled_worker_and_approved_supabase_secret_configured"?"notice":"error"} title=Disabled production generation result::${annotation}`);
 if(report.stopped?.action!=="disabled_worker_and_approved_supabase_secret_configured")process.exitCode=report.stopped?.denied?2:1;
}
