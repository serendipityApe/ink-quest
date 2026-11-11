import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dictionaryKeys, enrichSceneEdge, type DictionaryReader } from '../src/enrich.js';
import { advanceEnrichment } from '../src/enrich-step.js';
import { initialPreparation, prepareScene } from '../src/prepare.js';

const en = { text: 'The library, and you.', plotWords: ['you'], choices: [], targetLang: 'en' as const, glossLang: 'zh' as const };
test('base words and punctuation never query dictionary, but plot overrides do', async () => {
  const queried: string[] = [];
  const dictionary: DictionaryReader = { async lookup(_lang, words, version) {
    queried.push(...words);
    return { version, ready: true, entries: words.map(word => ({ word, reading: '/fixture/', candidates: ['meaning'], level: 'B1' })) };
  } };
  const result = await enrichSceneEdge(en, dictionary, 'v', () => []);
  assert.deepEqual(queried, ['library', 'you']);
  assert.equal(result.tokens.find(t => t.word === 'you')?.tier, 'key');
  assert.equal(result.tokens.find(t => t.word === 'you')?.meaning, 'meaning');
  assert.equal(result.tokens.find(t => t.word === 'The')?.meaning, null);
});
test('all-base scenes have zero dictionary requests, no unresolved meanings', async () => {
  const input = { ...en, text: 'The, and you.', plotWords: [] };
  let calls = 0;
  const dictionary: DictionaryReader = { async lookup() { calls++; throw Error('unavailable'); } };
  const result = await enrichSceneEdge(input, dictionary, 'v', () => []);
  assert.equal(calls, 0); assert.equal(result.unresolvedGlosses.length, 0);
  let progress; let final;
  for (let i = 0; i < 10; i++) { const next = await advanceEnrichment(input, dictionary, 'v', () => [], progress); progress = next.progress; if (next.enriched) { final = next.enriched; break; } }
  assert.deepEqual(final, result); assert.equal(calls, 0);
});
test('Chinese base plot keyword retains pinyin and dictionary meaning', async () => {
  const input = { ...en, text: '你。', plotWords: ['你'], targetLang: 'zh' as const, glossLang: 'en' as const };
  const dictionary: DictionaryReader = { async lookup(_lang, words, version) {
    assert.deepEqual(words, ['你']);
    return { version, ready: true, entries: [{ word: '你', reading: null, candidates: ['you'], level: 'HSK 1' }] };
  } };
  const result = await enrichSceneEdge(input, dictionary, 'v', () => ['你', '。']);
  assert.equal(result.tokens[0].reading, 'nǐ'); assert.equal(result.tokens[0].meaning, 'you');
});
test('text-first preparation is bounded and freezes exactly the enriched word sequence', async () => {
  const input = { ...en, text: 'The library and you. '.repeat(40).trim() };
  let preparation; let tokens;
  for (let i = 0; i < 30; i++) {
    const next = prepareScene(input, () => [], preparation);
    if (next.preparation) {
      assert.ok(next.preparation.cursor - (preparation?.cursor ?? 0) <= 384);
      assert.ok(next.preparation.renderCursor - (preparation?.renderCursor ?? 0) <= 64);
      preparation = JSON.parse(JSON.stringify(next.preparation));
    }
    if (next.initialTokens !== undefined) { tokens = next.initialTokens; break; }
  }
  assert.ok(tokens); assert.ok(tokens.every(t => t.meaning === null));
  const full = await enrichSceneEdge(input, { async lookup(_lang, words, version) {
    return { version, ready: true, entries: words.map(word => ({ word, reading: '/fixture/', candidates: ['meaning'], level: 'B1' })) };
  } }, 'v', () => []);
  assert.deepEqual(tokens.map(t => t.word), full.tokens.map(t => t.word));
  assert.deepEqual(dictionaryKeys(input, preparation.spans), ['library', 'you']);
});

test('write initializes preparation; final bounded render batch is immediately commit-ready', () => {
  for (const count of [1, 63, 64, 65, 128, 244]) {
    const input = { ...en, text: '晨'.repeat(count), targetLang: 'zh' as const, glossLang: 'en' as const };
    let previous = initialPreparation();
    const phases: string[] = [];
    for (let n = 0; n < 10; n++) {
      const next = prepareScene(input, text => [...text], previous);
      if (next.preparation) {
        assert.ok(next.preparation.cursor - previous.cursor <= 384);
        assert.ok(next.preparation.renderCursor - previous.renderCursor <= 64);
        phases.push(next.preparation.renderCursor > previous.renderCursor ? 'render' : 'segment');
        previous = JSON.parse(JSON.stringify(next.preparation));
      }
      if (next.initialTokens !== undefined) {
        assert.deepEqual(next.initialTokens, previous.tokens);
        assert.equal(next.initialTokens.length, count);
        assert.equal(previous.renderCursor, previous.spans.length);
        break;
      }
    }
    assert.deepEqual(phases, ['segment', ...Array(Math.ceil(count / 64)).fill('render')]);
  }
});

test('legacy missing and fully prepared checkpoints still resume without altering tokens', () => {
  const input = { ...en, text: 'The library.' };
  let preparation = prepareScene(input, () => []).preparation!;
  assert.deepEqual(preparation, initialPreparation());
  preparation = prepareScene(input, () => [], preparation).preparation!;
  const final = prepareScene(input, () => [], preparation);
  assert.ok(final.initialTokens);
  assert.deepEqual(prepareScene(input, () => [], final.preparation).initialTokens, final.initialTokens);
  // Fresh initialization never shares mutable arrays between independent jobs.
  preparation.tokens.push(final.initialTokens[0]);
  assert.deepEqual(initialPreparation().tokens, []);
});
test('legacy progress containing skipped keys resumes without repeat queries', async () => {
  const input = { ...en, text: 'The library.', plotWords: [] };
  let progress = (await advanceEnrichment(input, {} as DictionaryReader, 'v', () => [])).progress!;
  progress = (await advanceEnrichment(input, {} as DictionaryReader, 'v', () => [], progress)).progress!;
  progress.resolved = ['the', '.'];
  const next = await advanceEnrichment(input, { async lookup(_lang, words, version) {
    assert.deepEqual(words, ['library']); return { version, ready: true, entries: [] };
  } }, 'v', () => [], progress);
  assert.deepEqual(next.progress?.resolved, ['the', '.', 'library']);
});
