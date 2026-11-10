import { createLlmProvider } from "../../story-pipeline/src/providers/llm/index.js";
import { SupabaseEdgeStore } from "./store.js";
import { deliver, tick, type Services } from "./runner.js";
import { segmentChinese } from "./segment.js";
import { checkSpeechConfiguration, generateAudio, type StringEnv } from "./audio.js";
import { EdgeConfigurationError } from "./enrich.js";
import type { Delivery, QueueBinding } from "./contracts.js";
import {AssetServiceReader,type DictionaryServiceBinding} from './asset-service.js';

interface Env { GENERATION_QUEUE?: QueueBinding; GENERATION_ENABLED?: string; DICTIONARY?:DictionaryServiceBinding; [key: string]: unknown; }
function services(env:Env):Services & { reportReadiness(): Promise<void> }{
  if(!env.GENERATION_QUEUE)throw new EdgeConfigurationError("Generation queue binding is unavailable.");
  const config=Object.fromEntries(Object.entries(env).filter((entry):entry is [string,string]=>typeof entry[1]==="string")) as StringEnv;
  const dictionaryVersion=config.GENERATION_DICTIONARY_VERSION??"";
  const dictionary=env.DICTIONARY?new AssetServiceReader(env.DICTIONARY,dictionaryVersion,config.GENERATION_DICTIONARY_SOURCE_VERSION??'',config.GENERATION_DICTIONARY_MANIFEST_SHA256??''):undefined;
  const store=new SupabaseEdgeStore(config.SUPABASE_URL??"",config.SUPABASE_SERVICE_ROLE_KEY??"",dictionary);
  const provider=()=>createLlmProvider({...config,LLM_REQUEST_TIMEOUT_MS:"75000",LLM_REQUEST_ATTEMPTS:"1",LLM_USAGE_TELEMETRY:"true"});
  return {store,queue:env.GENERATION_QUEUE,dictionaryVersion,segmentChinese,provider,incrementalDictionary:!!dictionary,
    async preflight(lease){
      if(lease.job.jobType!=="opening"&&lease.job.jobType!=="scene")throw new EdgeConfigurationError("Unsupported job type.");
      if(lease.phase!=="audio"){
        if(!dictionaryVersion)throw new EdgeConfigurationError("Dictionary version is required.");
        await store.ready(lease.job.targetLanguage,dictionaryVersion);
      }
      if(lease.job.ttsMode==="every_scene")checkSpeechConfiguration(config,lease.job.targetLanguage);
    },audio:lease=>generateAudio(lease,config),
    async reportReadiness(){
      const capabilities={text_zh:false,text_en:false,audio_zh:false,audio_en:false};
      for(const lang of ["zh","en"] as const){
        try{
          provider();if(!dictionaryVersion)throw new EdgeConfigurationError("Dictionary version is required.");
          await store.ready(lang,dictionaryVersion);capabilities[`text_${lang}`]=true;
          try{checkSpeechConfiguration(config,lang);capabilities[`audio_${lang}`]=true;}catch{}
        }catch{}
      }
      await store.reportReadiness(dictionaryVersion,capabilities);
    }};
}
const generationWorker = {
  async queue(batch:{messages:Delivery[]},env:Env){
    if(env.GENERATION_ENABLED!=="true"){for(const m of batch.messages)m.retry({delaySeconds:600});return;}
    let s:Services;
    try{s=services(env);}catch{for(const m of batch.messages)m.retry({delaySeconds:600});return;}
    // One phase at a time bounds memory and total work per consumer delivery.
    for(const message of batch.messages)await deliver(message,s);
  },
  async scheduled(_event:unknown,env:Env){
    if(env.GENERATION_ENABLED!=="true")return;
    const s=services(env);
    // An unhealthy dictionary/provider closes creation, while recovery must
    // still release expired work. No credentials are included in the report.
    try{await s.reportReadiness();}catch{}
    await tick(s);
  },
};
export default generationWorker;
