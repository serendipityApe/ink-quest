// Control-plane READ ONLY. No deploy, message publish/pull, credentials upload,
// subscription changes, login or token creation. Responses are allowlisted.
import {appendFile} from "node:fs/promises";

export const ACCOUNT="fdfece8b5c135c21fa630440b8dbf2e4";
const BASE="https://api.cloudflare.com/client/v4";
const PRODUCTION="inkquest-generation";
const CANARY="inkquest-generation-cpu-canary-20261106";
class AuditStopped extends Error {}
export async function auditCloudflare({token,account=ACCOUNT,request=fetch}){
  const report={observedAt:new Date().toISOString(),mode:"read-only",mutations:0,
    completed:[],stopped:null,workersPlan:"unknown",queueWritePermission:"unverified",canaryAllowed:false};
  async function read(label,path){
    let response;
    try{response=await request(`${BASE}${path}`,{method:"GET",headers:{Authorization:`Bearer ${token}`},redirect:"manual",signal:AbortSignal.timeout(20_000)});}
    catch{report.stopped={action:label,reason:"transport_failure",denied:false};throw new AuditStopped();}
    let body;try{body=await response.json();}catch{body=null;}
    if(!response.ok||body?.success!==true){
      report.stopped={action:label,httpStatus:response.status,reason:response.status===401||response.status===403?"access_denied":"api_error",
        denied:response.status===401||response.status===403,errorCodes:(body?.errors??[]).map(e=>e.code).filter(Number.isInteger)};
      throw new AuditStopped();
    }
    report.completed.push(label);return body;
  }
  try{
    if(account!==ACCOUNT||!token){report.stopped={action:"local_validation",reason:!token?"existing_token_missing":"unexpected_account",denied:false};return report;}
    const queues=[];let complete=false;
    for(let page=1;page<=5;page++){
      const body=await read("list_queues",`/accounts/${ACCOUNT}/queues?page=${page}&per_page=20`);
      if(!Array.isArray(body.result))throw new AuditStopped();
      queues.push(...body.result);
      if(page>=(body.result_info?.total_pages??1)){complete=true;break;}
    }
    report.queueInventory={count:queues.length,complete,canaryExists:queues.some(q=>q.queue_name===CANARY)};
    const production=queues.find(q=>q.queue_name===PRODUCTION);
    if(production){
      report.productionQueue={name:PRODUCTION,consumers:production.consumers_total_count??production.consumers?.length??null,
        consumerScripts:(production.consumers??[]).map(c=>c.script_name).filter(Boolean),
        deliveryPaused:production.settings?.delivery_paused??null,retentionSeconds:production.settings?.message_retention_period??null};
      if(!/^[a-f0-9]{32}$/.test(production.queue_id))throw new AuditStopped();
      const metrics=await read("production_queue_metrics",`/accounts/${ACCOUNT}/queues/${production.queue_id}/metrics`);
      report.productionQueue.backlogCount=metrics.result?.backlog_count??null;
      report.productionQueue.backlogBytes=metrics.result?.backlog_bytes??null;
    }
    const scripts=await read("list_worker_scripts",`/accounts/${ACCOUNT}/workers/scripts`);
    if(!Array.isArray(scripts.result))throw new AuditStopped();
    const names=scripts.result.map(s=>s.id);
    report.workerInventory={count:names.length,
      productionGenerationWorkerExists:names.includes("inkquest-generation-worker"),
      canaryExists:names.includes("inkquest-generation-cpu-canary")};
    const settings=await read("workers_account_settings",`/accounts/${ACCOUNT}/workers/account-settings`);
    report.workersSettings={defaultUsageModel:settings.result?.default_usage_model??null};
    // Usage model alone is not proof of the billing plan. Do not infer Free.
    const subscriptions=await read("account_subscriptions",`/accounts/${ACCOUNT}/subscriptions`);
    report.workersSubscriptions=(subscriptions.result??[]).filter(s=>/workers/i.test(JSON.stringify(s.rate_plan??{})))
      .map(s=>({publicName:s.rate_plan?.public_name??null,scope:s.rate_plan?.scope??null,
        semanticId:/workers/i.test(s.rate_plan?.id??"")?s.rate_plan.id:null}));
    const labels=report.workersSubscriptions.map(s=>`${s.publicName??""} ${s.semanticId??""}`);
    if(labels.length&&labels.every(label=>/free/i.test(label)))report.workersPlan="free";
    else if(labels.some(label=>/paid|bundled|unbound|standard/i.test(label)))report.workersPlan="paid_or_other";
    const entitlements=await read("workers_queue_entitlements",`/accounts/${ACCOUNT}/entitlements`);
    report.allocations=(entitlements.result??[]).filter(e=>/workers|queues/i.test(e.feature?.key??e.id??""))
      .map(e=>({feature:e.feature?.key??e.id,type:e.allocation?.type,value:e.allocation?.value}));
    const verification=await read("verify_existing_token","/user/tokens/verify");
    const id=verification.result?.id;
    if(!/^[a-f0-9]{32}$/.test(id??""))throw new AuditStopped();
    const details=await read("existing_token_permissions",`/user/tokens/${id}`);
    const groups=new Set();let write=false;
    for(const policy of details.result?.policies??[]){
      const scoped=policy.effect==="allow"&&Object.keys(policy.resources??{}).some(k=>k===`com.cloudflare.api.account.${ACCOUNT}`||k==="com.cloudflare.api.account.*");
      if(!scoped)continue;
      for(const group of policy.permission_groups??[]){
        if(/Workers Scripts|Queues|Billing|Account|Workers Tail/i.test(group.name??""))groups.add(group.name);
        if(/^(Workers Scripts|Queues) (Write|Edit)$/.test(group.name??""))write=true;
      }
    }
    report.accountPermissionNames=[...groups].sort();report.queueWritePermission=write?"confirmed":"not_confirmed";
    // No mutation is ever performed by this script, even with enough rights.
    report.stopped={action:"audit_complete",reason:"daily_remaining_quota_not_yet_measured",denied:false};
  }catch(error){if(!(error instanceof AuditStopped))report.stopped={action:"audit",reason:"unexpected_response_shape",denied:false};}
  return report;
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const report=await auditCloudflare({token:process.env.CLOUDFLARE_API_TOKEN,account:process.env.CLOUDFLARE_ACCOUNT_ID});
  // Never print raw API bodies, financial amounts, token IDs or token values.
  const output=JSON.stringify(report,null,2);console.log(output);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Read-only Cloudflare audit\n\n\`\`\`json\n${output}\n\`\`\`\n`);
  if(report.stopped?.denied)process.exitCode=2;
  else if(report.stopped?.action!=="audit_complete")process.exitCode=1;
}
