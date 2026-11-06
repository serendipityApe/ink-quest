// Isolated, fixed-public-fixture Queue canary. Never deployed automatically.
// It has no secrets, database binding, producer, Cron, public route or fetch.
import productionWorker from "./index.js";
import {enrichSceneEdge} from "./enrich.js";
import {segmentChinese,segmenterMemoryBytes} from "./segment.js";

const chinese="小明今天来到图书馆，认真寻找一本关于宇宙的书。管理员微笑着告诉他，探索未知需要勇气和耐心。";
const english="Alice enters the quiet library and discovers a mysterious letter beside a silver key. ";
const cases={
  "zh-short":{language:"zh",text:chinese},
  "zh-paragraph":{language:"zh",text:chinese.repeat(10)},
  "zh-long":{language:"zh",text:chinese.repeat(70)},
  "en-short":{language:"en",text:english},
  "en-paragraph":{language:"en",text:english.repeat(10)},
  "en-long":{language:"en",text:english.repeat(100)},
} as const;
// Retain the production handler/dependency graph; it is never invoked here.
if(typeof productionWorker.queue!=="function")throw new Error("Production entry is missing.");
const canary={async queue(batch:{messages:Array<{body:unknown;ack():void}>}){
  for(const message of batch.messages){
    const key=(message.body as {caseId?:string}|null)?.caseId;
    if(!key||!Object.hasOwn(cases,key)){message.ack();continue;}
    const fixture=cases[key as keyof typeof cases];
    const result=await enrichSceneEdge({text:fixture.text,targetLang:fixture.language,
      glossLang:fixture.language==="zh"?"en":"zh",choices:[]},
    {async lookup(language,words,version){
      // Include bounded JSON encode/parse work without calling any service.
      return JSON.parse(JSON.stringify({version,ready:true,entries:words.map(word=>({word,
        reading:language==="en"?"/fixture/":null,candidates:["fixture meaning"],level:language==="en"?"B1":"HSK 3"}))}));
    }},"canary-fixture-v1",segmentChinese);
    console.log(JSON.stringify({event:"generation_cpu_canary",caseId:key,tokens:result.tokens.length,
      wasmMemoryBytes:segmenterMemoryBytes(),networkCalls:0}));
    message.ack();
  }
}};
export default canary;
