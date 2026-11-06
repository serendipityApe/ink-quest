// Completely local Speech protocol fixture. No actual Azure service is called.
const stats={plan:0,write:0,gloss:0,audio:0};
let readiness=null;
const speechFixture = {async fetch(request,env){
  const url=new URL(request.url);
  if(url.hostname==="database.invalid"){
    if(env.DATABASE)return env.DATABASE.fetch(request);
    const name=url.pathname.split("/").at(-1);
    if(name==="lookup_generation_dictionary")return Response.json({version:"fixture-v1",ready:true,entries:[]});
    if(name==="edge_report_generation_readiness"){readiness=await request.json();return new Response(null,{status:204});}
    if(name==="edge_recover_generation_jobs")return new Response(null,{status:204});
    if(name==="edge_pending_generation_jobs")return Response.json([]);
    return new Response("Unexpected fixture RPC",{status:503});
  }
  if(url.pathname==="/readiness")return Response.json(readiness);
  if(url.pathname==="/stats")return Response.json(stats);
  if(url.hostname==="api.openai.com"){
    const body=await request.json();const payload=JSON.parse(body.input);let result;
    if(payload.task.startsWith("Plan")){stats.plan++;result={title:"Library",worldBible:{},characters:[],openingIntent:"Explore"};}
    else if(payload.task.startsWith("Write")){stats.write++;result={text:"Hello world. Alice opens the library door and finds a mysterious letter beside a silver key.",summary:"A letter",plotWords:[],
      choices:["Read","Listen","Leave"].map(label=>({label,intent:label,branchSeed:{}})),stateDelta:{}};}
    else{stats.gloss++;result={resolutions:payload.input.unresolvedTokenIndexes.map(tokenIndex=>({tokenIndex,meaning:"测试释义"}))};}
    return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(result)}]}]});
  }
  if(request.headers.get("Upgrade")!=="websocket")return new Response("External requests are disabled",{status:503});
  const [client,server]=Object.values(new WebSocketPair());server.accept();
  server.addEventListener("message",event=>{
    if(typeof event.data!=="string"||!/Path:\s*ssml/i.test(event.data))return;
    stats.audio++;
    const id=/X-RequestId:\s*([^\r\n]+)/i.exec(event.data)?.[1];
    const frame=(path,body)=>`X-RequestId:${id}\r\nContent-Type:application/json\r\nPath:${path}\r\n\r\n${JSON.stringify(body)}`;
    server.send(frame("turn.start",{}));server.send(frame("response",{audio:{streamId:"fixture-stream"}}));
    const spoken=event.data.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/<[^>]*>/g,"").trim();
    const words=[...new Intl.Segmenter("en",{granularity:"word"}).segment(spoken)].filter(s=>s.isWordLike);
    const metadata=words.filter((_word,i)=>!event.data.includes("mock-missing")||i===0).map((word,i)=>({Type:"WordBoundary",
      Data:{Offset:i*1_000_000,Duration:1_000_000,text:{Text:word.segment,Length:word.segment.length,BoundaryType:"WordBoundary"}}}));
    metadata.push({Type:"SessionEnd",Data:{Offset:(words.length+1)*1_000_000}});
    server.send(frame("audio.metadata",{Metadata:metadata}));
    const headers=new TextEncoder().encode(`X-RequestId:${id}\r\nX-StreamId:fixture-stream\r\nPath:audio\r\nContent-Type:audio/mpeg\r\n`);
    const binary=new Uint8Array(headers.length+2+4);new DataView(binary.buffer).setUint16(0,headers.length);binary.set(headers,2);binary.set([255,251,144,0],headers.length+2);server.send(binary);
    server.send(frame("turn.end",{}));
  });
  return new Response(null,{status:101,webSocket:client});
}};
export default speechFixture;
