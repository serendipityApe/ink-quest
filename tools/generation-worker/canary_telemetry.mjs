// Platform events put the invocation correlation ID in $metadata.requestId.
// Console logs and invocation logs are separate events with the same ID.
const CASES=new Set(["zh-short","zh-paragraph","zh-long","en-short","en-paragraph","en-long"]);
function fixture(value){
  if(typeof value==="string"){try{return fixture(JSON.parse(value));}catch{return null;}}
  if(!value||typeof value!=="object")return null;
  if(value.event==="generation_cpu_canary"&&CASES.has(value.caseId)&&value.networkCalls===0)
    return {caseId:value.caseId,tokens:value.tokens,wasmMemoryBytes:value.wasmMemoryBytes,networkCalls:0};
  for(const v of Object.values(value)){const found=fixture(v);if(found)return found;}
  return null;
}
export function extractCanaryTelemetry(result,worker){
  const invocations=new Map(),fixtures=new Map();
  function visit(value){
    if(!value||typeof value!=="object")return;
    const w=value.$workers,m=value.$metadata,id=m?.requestId??w?.requestId;
    if(w?.scriptName===worker&&w.eventType==="queue"&&id){
      if(Number.isFinite(w.cpuTimeMs))invocations.set(id,{requestId:id,cpuTimeMs:w.cpuTimeMs,
        wallTimeMs:w.wallTimeMs??null,outcome:w.outcome??null,scriptVersion:w.scriptVersion?.id??null});
      const f=fixture(value.source)??fixture(m?.message);
      if(f)fixtures.set(id,f);
    }
    for(const v of Object.values(value))visit(v);
  }
  visit(result);
  return {invocations:[...invocations.values()],samples:[...invocations.values()].flatMap(i=>fixtures.has(i.requestId)?[{...i,...fixtures.get(i.requestId)}]:[])};
}
