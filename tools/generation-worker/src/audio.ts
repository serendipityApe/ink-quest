import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { alignAzureBoundaries, spokenText, type AzureBoundary } from "../../story-pipeline/src/tts/azure-align.js";
import type { Lease } from "./contracts.js";
import type { CommitGeneratedAudioInput } from "../../story-pipeline/src/worker/store.js";
import { EdgeConfigurationError } from "./enrich.js";
import { StoreUnavailable } from "./store.js";

export type StringEnv=Record<string,string|undefined>;
export function checkSpeechConfiguration(env:StringEnv,lang:"zh"|"en"){
  const provider=env[`STORY_TTS_${lang.toUpperCase()}_PROVIDER`]??"azure";
  if(provider!=="azure") throw new EdgeConfigurationError("This edge worker supports Azure narration; Tencent ffmpeg concatenation is not supported.","narration_provider_unsupported");
  if(!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION || !/^[a-z0-9-]+$/.test(env.AZURE_SPEECH_REGION))
    throw new EdgeConfigurationError("Azure narration is not configured.","narration_not_configured");
}
export async function synthesizeAzure(words:string[],lang:"zh"|"en",env:StringEnv,voice?:string|null){
  checkSpeechConfiguration(env,lang);
  if(!words.length || words.length>2000 || words.some(w=>!w)) throw new EdgeConfigurationError("Invalid narration segments.");
  const voiceId=voice?.trim()||env[`AZURE_TTS_VOICE_${lang.toUpperCase()}`]||
    (lang==="zh"?"zh-CN-Xiaoxiao:DragonHDFlashLatestNeural":"en-US-JennyNeural");
  const config=sdk.SpeechConfig.fromSubscription(env.AZURE_SPEECH_KEY!,env.AZURE_SPEECH_REGION!);
  config.speechSynthesisVoiceName=voiceId;
  config.speechSynthesisOutputFormat=sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
  const synthesizer=new sdk.SpeechSynthesizer(config,null);
  const boundaries:AzureBoundary[]=[];
  synthesizer.wordBoundary=(_sender,event)=>{
    if(event.boundaryType!==sdk.SpeechSynthesisBoundaryType.Sentence) boundaries.push({audioOffset:event.audioOffset,
      duration:event.duration,textOffset:event.textOffset,wordLength:event.wordLength});
  };
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const result=await Promise.race([
      new Promise<sdk.SpeechSynthesisResult>((resolve,reject)=>synthesizer.speakTextAsync(spokenText(words,lang),resolve,reject)),
      new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Narration timed out.")),90_000);}),
    ]);
    if(result.reason!==sdk.ResultReason.SynthesizingAudioCompleted || !result.audioData?.byteLength || result.audioData.byteLength>15_728_640)
      throw new EdgeConfigurationError("Narration did not return valid bounded audio.");
    const timings=alignAzureBoundaries(words,lang,boundaries);
    const durationMs=Math.round(result.audioDuration/10_000);
    if(!Number.isFinite(durationMs)||durationMs<=0||timings.at(-1)!.end>durationMs+50)
      throw new EdgeConfigurationError("Narration word boundaries exceed the audio duration.");
    return {audio:new Uint8Array(result.audioData),timings,durationMs,voiceId};
  } finally {if(timer)clearTimeout(timer);synthesizer.close();}
}
export async function generateAudio(lease:Lease,env:StringEnv):Promise<CommitGeneratedAudioInput>{
  const job=lease.job;
  if(!job.nodeId || !job.textSegments?.length) throw new EdgeConfigurationError("Committed narration segments are missing.");
  const words=job.textSegments.map(segment=>segment&&typeof segment==="object"&&!Array.isArray(segment)&&typeof segment.word==="string"?segment.word:"");
  const result=await synthesizeAzure(words,job.targetLanguage,env,job.ttsVoiceId);
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",result.audio));
  const contentHash=[...hash].map(n=>n.toString(16).padStart(2,"0")).join("");
  const objectKey=`${job.userId}/${job.storyId}/${job.nodeId}/v${job.nodeVersion??1}/${contentHash}.mp3`;
  try{
    const response=await fetch(`${env.SUPABASE_URL!.replace(/\/$/,"")}/storage/v1/object/generated-audio/${objectKey}`,{
      method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type":"audio/mpeg","x-upsert":"true","Cache-Control":"31536000, immutable"},
      body:result.audio,redirect:"manual",signal:AbortSignal.timeout(10_000),
    });
    if(!response.ok)throw new Error("Audio upload failed.");
  }catch{throw new StoreUnavailable("Audio upload response was unavailable.");}
  return {jobId:job.jobId,leaseOwner:lease.owner,provider:"azure",voiceId:result.voiceId,objectKey,contentHash,
    durationMs:result.durationMs,timestamps:result.timings.map(({start,end})=>({start,end}))};
}
