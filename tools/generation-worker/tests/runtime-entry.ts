// Test-only HTTP harness. Production index.ts intentionally exports no fetch.
import worker from "../src/index.js";
import { segmentChinese,segmenterMemoryBytes } from "../src/segment.js";
import { enrichSceneEdge,prepareEnrichmentSpans,prepareEnrichmentChunk } from "../src/enrich.js";
import { synthesizeAzure } from "../src/audio.js";
import canary from "../src/canary.js";

const entries={en:[{word:"library",reading:"/laɪbrəri/",candidates:["n. 图书馆"],level:"B1"}],
  zh:[{word:"图书馆",reading:null,candidates:["library"],level:"HSK 3"}]};
const testHarness = {async fetch(request:Request){
  const input=await request.json() as {mode:string;text?:string;lang?:"en"|"zh";missing?:boolean};
  try{
    if(input.mode==="disabled"){
      let acks=0,retries=0;
      await worker.queue({messages:[{body:{jobId:crypto.randomUUID()},ack(){acks++;},retry(){retries++;}}]},{});
      await worker.scheduled({},{});
      return Response.json({acks,retries});
    }
    if(input.mode==="heartbeat" || input.mode==="heartbeat-async"){
      await worker.scheduled({},{GENERATION_ENABLED:"true",GENERATION_QUEUE:{async send(){throw new Error("Unexpected canary dispatch");}},
        ...(input.mode==='heartbeat-async'?{GENERATION_ASYNC_DICTIONARY:'true',DICTIONARY:{async lookup(){throw Error('dictionary unavailable');}},GENERATION_DICTIONARY_MANIFEST_SHA256:'invalid'}:{}),
        SUPABASE_URL:"https://database.invalid",SUPABASE_SERVICE_ROLE_KEY:"fixture-key",GENERATION_DICTIONARY_VERSION:"fixture-v1",
        LLM_PROVIDER:"openai",OPENAI_API_KEY:"fixture-key",OPENAI_MODEL:"fixture-model"});
      return await fetch("https://fixture.invalid/readiness");
    }
    if(input.mode==="canary"){
      let acks=0;await canary.queue({messages:["zh-short","zh-paragraph","zh-long","en-short","en-paragraph","en-long"].map(caseId=>({body:{caseId},ack(){acks++;}}))});
      return Response.json({acks});
    }
    if(input.mode==="segment"){
      const started=performance.now();const words=segmentChinese(input.text??"");
      return Response.json({words,elapsedMs:performance.now()-started,wasmMemoryBytes:segmenterMemoryBytes()});
    }
    if(input.mode==="preparation"){
      const value={text:input.text??"",targetLang:input.lang??"zh",glossLang:"en" as const,choices:[]};
      let cursor=0;const spans=[];while(cursor<value.text.trim().length){const next=prepareEnrichmentChunk(value,segmentChinese,cursor);spans.push(...next.spans);cursor=next.prepareCursor;}
      return Response.json({spans,whole:prepareEnrichmentSpans(value,segmentChinese)});
    }
    if(input.mode==="enrich"){
      const lang=input.lang??"en";
      return Response.json(await enrichSceneEdge({text:input.text??"",targetLang:lang,glossLang:lang==="en"?"zh":"en",choices:[]},
        {async lookup(){return {version:"fixture-v1",ready:!input.missing,entries:entries[lang] as never};}},"fixture-v1",segmentChinese));
    }
    if(input.mode==="audio"){
      const result=await synthesizeAzure(["Hello","world","."],"en",{AZURE_SPEECH_KEY:"fixture-key",AZURE_SPEECH_REGION:"fixture"},input.missing?"mock-missing":"mock-complete");
      return Response.json({bytes:result.audio.byteLength,timings:result.timings,durationMs:result.durationMs});
    }
    return new Response("Unknown test",{status:400});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Test failed"},{status:422});}
}};
export default testHarness;
