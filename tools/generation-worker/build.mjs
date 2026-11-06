import { build } from "esbuild";
import { copyFile, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root=dirname(fileURLToPath(import.meta.url));
await rm(join(root,"dist"),{recursive:true,force:true});
await mkdir(join(root,"dist"),{recursive:true});
const result=await build({entryPoints:[join(root,"src/index.ts")],outfile:join(root,"dist/worker.js"),
  bundle:true,format:"esm",platform:"browser",target:"es2022",conditions:["browser"],metafile:true,minify:true,
  inject:[join(root,"src/speech-websocket.ts")],define:{"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"worker-wasm",setup(builder){builder.onResolve({filter:/\.wasm$/},()=>({path:"./jieba.wasm",external:true}));}}]});
await copyFile(join(root,"vendor/jieba-wasm/jieba_rs_wasm_bg.wasm"),join(root,"dist/jieba.wasm"));
await writeFile(join(root,"dist/metafile.json"),JSON.stringify(result.metafile,null,2));
console.log("Built inert generation Worker; no deployment or external calls performed.");
