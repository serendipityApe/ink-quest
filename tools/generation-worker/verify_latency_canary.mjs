// Isolated, one-shot CI experiment. Never targets production generation or a model.
import assert from 'node:assert/strict';
import {readFile,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ACCOUNT,SOURCE,VERSION,MANIFEST,READER,READER_VERSION} from './activation_checks.mjs';
export const WORKER='inkquest-generation-cpu-canary';
export const QUEUE='f5408177e3c3462fac2746874902f80d';
export const CASES=['lookup-distinct','prepare-en','prepare-zh','lookup-en','lookup-zh','render-en','render-zh','finish-en','finish-zh','invalid-version'];
export function checkBindings(bindings){
 assert.ok(Array.isArray(bindings));assert.equal(bindings.length,4);
 const b=Object.fromEntries(bindings.map(x=>[x.name,x]));assert.equal(Object.keys(b).length,4);
 assert.equal(b.DICTIONARY?.type,'service');assert.equal(b.DICTIONARY.service,READER);assert.equal(b.DICTIONARY.entrypoint,'Dictionary');assert.ok(!b.DICTIONARY.environment||b.DICTIONARY.environment==='production');
 for(const [name,text] of Object.entries({GENERATION_DICTIONARY_VERSION:VERSION,GENERATION_DICTIONARY_SOURCE_VERSION:SOURCE,GENERATION_DICTIONARY_MANIFEST_SHA256:MANIFEST})){assert.equal(b[name]?.type,'plain_text');assert.equal(b[name].text,text);}
}
export function checkConsumer(consumers){assert.equal(consumers.length,1);const c=consumers[0];assert.equal(c.script_name??c.script,WORKER);if(c.script_name&&c.script)assert.equal(c.script_name,c.script);for(const [key,value] of Object.entries({batch_size:1,max_concurrency:1,max_retries:0}))assert.equal(c.settings?.[key],value);}
export function telemetry(data,script,version){
 const records=new Map(),fixtures=new Map();
 function fixture(x){if(typeof x==='string'){try{return fixture(JSON.parse(x));}catch{return null;}}if(!x||typeof x!=='object')return null;if(x.event==='dictionary_asset_canary')return x;for(const v of Object.values(x)){const f=fixture(v);if(f)return f;}return null;}
 function visit(x){if(!x||typeof x!=='object')return;const w=x.$workers,id=x.$metadata?.requestId??w?.requestId;if(w?.scriptName===script&&id){if(w.scriptVersion?.id===version&&Number.isFinite(w.cpuTimeMs))records.set(id,{requestId:id,cpuMs:w.cpuTimeMs,outcome:w.outcome});const f=fixture(x.source)??fixture(x.$metadata?.message);if(f)fixtures.set(id,f);}for(const v of Object.values(x))visit(v);}
 visit(data);return [...records.values()].map(row=>({...row,fixture:fixtures.get(row.requestId)}));
}
export function checkSample(sample,caseId){assert.equal(sample.outcome,'ok');assert.ok(sample.cpuMs<=10);const f=sample.fixture;assert.equal(f?.caseId,caseId);assert.equal(f.verified,true);assert.equal(f.modelCalls,0);assert.equal(f.databaseCalls,0);if(caseId==='lookup-distinct'){assert.equal(f.rpcCalls,5);assert.equal(f.lookupWords,16);assert.equal(f.maxConcurrentReads,4);}assert.ok(Number.isInteger(f.rpcCalls)&&f.rpcCalls>=1&&f.rpcCalls<=(caseId.startsWith('lookup')?5:1));if(caseId!=='invalid-version'){assert.ok(f.checkpointBytes>0&&f.checkpointBytes<=1000000);assert.ok(Number.isFinite(f.wasmMemoryBytes)&&f.wasmMemoryBytes<134217728);assert.equal(f.phase,caseId.startsWith('finish')?'gloss':'enrich');}}
export async function run(){
 const report={startedAt:new Date().toISOString(),messagesAccepted:0,samples:[],completed:false};let action='ci_guard';
 async function api(path,body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('http_'+r.status);const d=await r.json();if(d.success!==true)throw Error('api_failed');return d.result;}
 async function observe(script,version,from){return telemetry(await api('/workers/observability/telemetry/query',{queryId:'inkquest-isolated-latency',dry:true,view:'events',limit:1000,timeframe:{from,to:Date.now()},parameters:{filters:[{key:'$metadata.service',type:'string',operation:'eq',value:script}]}}),script,version);}
 async function isolation(){
  checkConsumer(await api(`/queues/${QUEUE}/consumers`));const q=await api(`/queues/${QUEUE}`);assert.equal(q.queue_name,'inkquest-generation-cpu-canary-20261106');
  for(const worker of [WORKER,READER]){const u=await api(`/workers/scripts/${worker}/subdomain`);assert.equal(u.enabled,false);assert.equal(u.previews_enabled,false);assert.deepEqual(await api(`/workers/services/${worker}/environments/production/routes?show_zonename=true`),[]);assert.deepEqual(await api(`/workers/domains/records?page=0&per_page=5&service=${worker}&environment=production`),[]);}
  assert.deepEqual((await api(`/workers/scripts/${WORKER}/schedules`)).schedules,[]);
  assert.deepEqual((await api(`/workers/scripts/${READER}/deployments`)).deployments?.[0]?.versions,[{version_id:READER_VERSION,percentage:100}]);
 }
 try{
  assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','rerun_prohibited');assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);assert.ok(process.env.CLOUDFLARE_API_TOKEN);assert.ok(!process.env.SUPABASE_SERVICE_ROLE_KEY&&!process.env.OPENAI_API_KEY);
  const marker=JSON.parse(await readFile('.github/generation-latency-request.json','utf8'));assert.match(marker.experiment??'',/^latency-[a-z0-9-]{8,60}$/);assert.equal(marker.productionActivation,false);const annotation='Isolated '+marker.experiment;report.experiment=marker.experiment;
  action='verify_isolation';await isolation();
  action='guard_repeat';const history=await api(`/workers/scripts/${WORKER}/deployments`);const versions=await api(`/workers/scripts/${WORKER}/versions?per_page=100`);assert.ok(Array.isArray(history.deployments)&&Array.isArray(versions.items));assert.ok(versions.items.length<100,'history_inventory_incomplete');
  // Interrupted uploads count as consumed experiments too. Never resend on rerun.
  assert.ok(!JSON.stringify([history,versions]).includes(marker.experiment),'experiment_already_seen');
  action='upload_candidate';const upload=spawnSync('pnpm',['exec','wrangler','versions','upload','--config','tools/generation-worker/wrangler.latency-canary.jsonc','--message',annotation],{encoding:'utf8',timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});assert.equal(upload.status,0,'upload_failed_no_retry');const ids=[...(upload.stdout??'').matchAll(/Worker Version ID:\s*([a-f0-9-]{36})/g)];assert.equal(ids.length,1);const version=ids[0][1];report.version=version;
  action='verify_candidate';const candidate=await api(`/workers/scripts/${WORKER}/versions/${version}`);checkBindings(candidate.resources?.bindings);assert.equal(candidate.annotations?.['workers/message'],annotation);
  action='activate_isolated_candidate';await api(`/workers/scripts/${WORKER}/deployments`,{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':annotation}});
  action='verify_active_candidate';await isolation();checkBindings((await api(`/workers/scripts/${WORKER}/settings`)).bindings);assert.deepEqual((await api(`/workers/scripts/${WORKER}/deployments`)).deployments?.[0]?.versions,[{version_id:version,percentage:100}]);
  for(const caseId of CASES){
   const from=Date.now();action='send_'+caseId;await api(`/queues/${QUEUE}/messages`,{body:{caseId},content_type:'json'});report.messagesAccepted++;
   action='measure_'+caseId;let sample,readers=[];
   for(let n=0;n<8;n++){await new Promise(resolve=>setTimeout(resolve,10000));const rows=await observe(WORKER,version,from);readers=await observe(READER,READER_VERSION,from);assert.ok([...rows,...readers].every(x=>x.outcome==='ok'&&x.cpuMs<=10),'cpu_or_execution_failed');sample=rows.find(x=>x.fixture?.caseId===caseId);if(sample&&readers.length>=sample.fixture.rpcCalls)break;}
   assert.ok(sample,'matching_sample_missing');checkSample(sample,caseId);assert.ok(readers.length>=sample.fixture.rpcCalls,'reader_cpu_missing');report.samples.push({caseId,cpuMs:sample.cpuMs,readerMaxCpuMs:Math.max(...readers.map(x=>x.cpuMs)),rpcCalls:sample.fixture.rpcCalls,lookupWords:sample.fixture.lookupWords,maxConcurrentReads:sample.fixture.maxConcurrentReads,checkpointBytes:sample.fixture.checkpointBytes,wasmMemoryBytes:sample.fixture.wasmMemoryBytes});
  }
  action='final_isolation';await isolation();report.completed=true;
 }catch(error){report.stopped={action,reason:/^http_\d+$/.test(error.message)?error.message:'guard_or_transport_failed_no_retry'};process.exitCode=1;}
 const safe=JSON.stringify(report);console.log(safe);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,safe+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await run();
