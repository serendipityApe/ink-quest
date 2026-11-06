import { build } from "esbuild";
import { copyFile, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root=dirname(fileURLToPath(import.meta.url));
const canary=process.argv.includes("--canary");
const output=join(root,canary?"dist-canary":"dist");
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
const result=await build({entryPoints:[join(root,canary?"src/canary.ts":"src/index.ts")],outfile:join(output,"worker.js"),
  bundle:true,format:"esm",platform:"browser",target:"es2022",conditions:["browser"],metafile:true,minify:true,
  inject:[join(root,"src/speech-websocket.ts")],define:{"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"worker-wasm",setup(builder){builder.onResolve({filter:/\.wasm$/},()=>({path:"./jieba.wasm",external:true}));}}]});
await copyFile(join(root,"vendor/jieba-wasm/jieba_rs_wasm_bg.wasm"),join(output,"jieba.wasm"));
await writeFile(join(output,"metafile.json"),JSON.stringify(result.metafile,null,2));
console.log("Built inert generation Worker; no deployment or external calls performed.");
