import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/generation/reading-layout.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, Intl });
const { readingLayout } = module.exports;
function tokens(text, lang = 'en') { return [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(text)].filter(s => s.segment.trim()).map(s => ({ word: s.segment })); }
function verify(text, words, lang) {
  const layout = readingLayout(text, words, lang);
  assert.equal(layout.paragraphs.flatMap(p => p.runs).map(r => r.text).join(''), text, 'all source characters preserved');
  assert.deepEqual(Array.from(layout.paragraphs.flatMap(p => p.runs).filter(r => r.tokenIndex !== undefined).map(r => r.tokenIndex)), words.map((_, i) => i), 'stable token/audio indices');
  return layout;
}
test('preserves explicit English paragraphs and punctuation spacing rather than guessing spaces', () => {
 const text = '“Welcome,” he said. “Your first trial is here.”\n\nShe held a ticket.\n\n“Can I leave?” she asked.';
 const words = tokens(text); const layout = verify(text, words, 'en');
 assert.equal(layout.paragraphs.length, 3);
 const welcome = words.findIndex(w => w.word === 'Welcome'); assert.equal(layout.prefixes[welcome], '');
 const comma = words.findIndex(w => w.word === ','); assert.equal(layout.prefixes[comma], '');
});
test('legacy long prose groups complete sentences without altering tokens or text', () => {
 const text = Array.from({length:9}, (_, i) => `Sentence ${i} continues along the quiet platform, beneath the old clock.`).join(' ');
 assert.equal(verify(text, tokens(text), 'en').paragraphs.length, 3);
});
test('Chinese explicit paragraphs preserve Unicode, pinyin token indexes and CRLF', () => {
 const text = '雨停了。“我们走吧！”\r\n\r\n她推开门，月亮升起。🌙';
 assert.equal(verify(text, tokens(text, 'zh'), 'zh').paragraphs.length, 2);
});
test('no segment arrays: preserve all raw prose and paragraph boundaries', () => {
 const text = 'A breeze rose. 🌙\n\n她笑了。'; assert.equal(verify(text, [], 'zh').paragraphs.length, 2);
});
test('a token spanning punctuation is never split or assigned multiple audio indexes', () => {
 const text = 'One. Two. Three. Four.'; const words = [{word: text}];
 assert.equal(verify(text, words, 'en').paragraphs.length, 1);
});
test('missing/mismatched source safely retains legacy tokens, not wrong source-to-definition alignment', () => {
 const words = [{word:'Hello'}, {word:','}, {word:'world'}, {word:'!'}];
 assert.equal(readingLayout('Different source', words, 'en').source, 'Hello, world!');
});
test('repeated terms map in order and dictionary enrichment cannot change layout', () => {
 const text = 'Go, go!\n\nGo again.'; const words = tokens(text);
 const before = verify(text, words, 'en');
 const after = verify(text, words.map(t => ({...t, meaning:'updated'})), 'en');
 assert.deepEqual(before, after);
});

test('legacy grouping does not break inside multi-sentence dialogue', () => {
 const text = '“' + Array.from({length:6}, (_, i) => `Sentence ${i} continues along the quiet platform beneath the old clock.`).join(' ') + '”';
 assert.equal(verify(text, tokens(text), 'en').paragraphs.length, 1);
});
