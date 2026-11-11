import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../src/app/HomeClient.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(lang='en',reduced=false){
 const states=[];let i=0,effect,tick,delay,cleared;const mod={exports:{}};
 vm.runInNewContext(code,{module:mod,exports:mod.exports,process:{env:{}},window:{matchMedia:()=>({matches:reduced}),setInterval:(fn,ms)=>{tick=fn;delay=ms;return 42},clearInterval:id=>{cleared=id}},require(name){
 if(name==='react')return {useState(v){const n=i++;if(!(n in states))states[n]=v;return [states[n],x=>states[n]=typeof x==='function'?x(states[n]):x]},useEffect(fn){effect=fn}};
 if(name==='react/jsx-runtime')return require(name);
 if(name==='@/i18n/I18nProvider')return {useTranslations:()=>({lang})};
 if(name==='@/hooks/useAudioSync')return {useAudioSync:()=>({})};
 if(name==='@/lib/stories/entry-points')return {DEFAULT_STORY_HREF:'/stories/demo',DEFAULT_STORY_ID:'demo'};
 if(name==='lucide-react')return {ChevronRight:'i',Volume2:'i'};
 return {default:'mock'};
 }});
 function flatten(x){return Array.isArray(x)?x.flatMap(flatten):x&&typeof x==='object'?[x,...flatten(x.props?.children)]:[]}
 function render(){i=0;return flatten(mod.exports.default({demoSegments:[],demoTimestamps:[],demoAudioUrl:''}))}
 return {render,start:()=>effect(),step:()=>tick(),delay:()=>delay,cleared:()=>cleared};
}
for(const lang of ['en','zh'])test(`hero vertically rotates both ${lang} language labels and cleans up`,()=>{
 const h=harness(lang);let tree=h.render();const words=tree.filter(x=>x.props?.className==='language-roller__word').map(x=>x.props.children);assert.deepEqual(words,lang==='en'?['Chinese','English']:['中文','英文']);
 const cleanup=h.start();assert.equal(h.delay(),1000);h.step();tree=h.render();assert.equal(tree.find(x=>x.props?.className==='language-roller__track').props.style.transform,'translateY(-1.18em)');h.step();assert.equal(h.render().find(x=>x.props?.className==='language-roller__track').props.style.transform,'translateY(-0em)');cleanup();assert.equal(h.cleared(),42);
});
test('reduced motion leaves the language label static',()=>{const h=harness('en',true);h.render();assert.equal(h.start(),undefined);assert.equal(h.delay(),undefined)});
