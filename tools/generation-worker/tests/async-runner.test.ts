import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isolatedDatabase } from './database.mjs';
import { postgrestResponse } from './postgrest.mjs';
import { SupabaseEdgeStore, StoreUnavailable } from '../src/store.js';
import { deliver, tick, type Services } from '../src/runner.js';

let db: Awaited<ReturnType<typeof isolatedDatabase>>;
const fetchOriginal = globalThis.fetch;
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const entries = Object.entries(args);
  return (await db.query(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) result`, entries.map(([, value]) => value))).rows[0].result;
}
before(async () => {
  db = await isolatedDatabase({ includeAssets: true });
  globalThis.fetch = async (url, request = {}) => {
    assert.ok(String(url).startsWith('https://database.invalid/rest/v1/rpc/'), 'Only isolated SQL allowed');
    const name = String(url).split('/').at(-1)!;
    return postgrestResponse(name, await rpc(name, JSON.parse(String(request.body))));
  };
});
after(async () => { globalThis.fetch = fetchOriginal; await db.close(); });
async function fixture(language: 'en' | 'zh' = 'en') {
  const user = crypto.randomUUID();
  await db.query('insert into auth.users(id) values($1)', [user]);
  await rpc('grant_credits', { p_user_id: user, p_amount: 100, p_source_type: 'test', p_source_id: user, p_idempotency_key: `grant:${user}` });
  const row = (await db.query(`select * from public.create_generated_story_job($1,$4,$5,'Library','off',20,'test',$2,$3,'{}')`, [user, `request:${user}`, [{ code: 'scene_text', credits: 20 }], language, language === 'zh' ? 'HSK 4' : 'B1'])).rows[0];
  const store = new SupabaseEdgeStore('https://database.invalid', 'fixture');
  const enrichmentStore = new SupabaseEdgeStore('https://database.invalid', 'fixture', undefined, true);
  const counts = { plan: 0, write: 0, lookup: 0, gloss: 0 };
  const queue: Array<{ jobId: string; kind?: 'enrichment' }> = [];
  enrichmentStore.lookup = async (_lang, _words, version) => { counts.lookup++; return { version, ready: true, entries: [] }; };
  const s: Services = {
    store, enrichmentStore, asyncDictionary: true, dictionaryVersion: 'fixture', segmentChinese: () => [],
    queue: { async send(body) { queue.push(body); } }, async preflight() {}, async audio() { throw Error('No audio'); },
    provider() { return { provider: 'fixture', model: 'fixture', promptVersion: 'fixture',
      async planStory() { counts.plan++; return { title: 'Library', worldBible: {}, characters: [], openingIntent: 'Explore' }; },
      async writeScene() { counts.write++; return { text: 'You enter a library and discover a mysterious silver key beside the door.', plotWords: ['You'], summary: 'A key', choices: ['Read', 'Wait', 'Leave'].map(label => ({ label, intent: label, branchSeed: {} })), stateDelta: {} }; },
      async resolveGlosses(input) { counts.gloss++; return input.unresolvedTokenIndexes.map(tokenIndex => ({ tokenIndex, meaning: 'meaning' })); },
    }; },
  };
  async function run(body = { jobId: row.job_id } as { jobId: string; kind?: 'enrichment' }) {
    const result = { acks: 0, retries: [] as number[] };
    await deliver({ body, ack() { result.acks++; }, retry({ delaySeconds }) { result.retries.push(delaySeconds); } }, s);
    return result;
  }
  async function primary() { await run(); for (let n = 0; n < 30 && queue.some(body => !body.kind); n++) { const i = queue.findIndex(body => !body.kind); await run(queue.splice(i, 1)[0]); } }
  async function drain() { for (let i = 0; i < 50 && queue.length; i++) await run(queue.shift()!); assert.equal(queue.length, 0); }
  async function state() { return (await db.query(`select j.status,(select count(*)::int from public.credit_ledger where reservation_id=j.reservation_id and entry_type='settle') settles,(select count(*)::int from public.story_nodes where created_by_job_id=j.id) nodes,(select status from public.generation_enrichment_jobs where job_id=j.id) enrichment from public.generation_jobs j where j.id=$1`, [row.job_id])).rows[0]; }
  return { row, store, enrichmentStore, counts, queue, s, run, primary, drain, state };
}
test('text commits and choices are ready before any dictionary or gloss request', async () => {
  const f = await fixture(); await f.primary();
  assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'queued' });
  assert.deepEqual(f.counts, { plan: 1, write: 1, lookup: 0, gloss: 0 });
  assert.equal(f.queue[0].kind, 'enrichment');
  const node = (await db.query('select text_segments,model_metadata from public.story_nodes where created_by_job_id=$1', [f.row.job_id])).rows[0];
  assert.equal(node.model_metadata.enrichmentStatus, 'pending'); assert.ok(node.text_segments.every(t => t.meaning === null));
  await f.drain(); assert.equal((await f.state()).enrichment, 'completed'); assert.equal(f.counts.gloss, 1); assert.equal((await f.state()).settles, 1);
});

test('365 UTF-16 units / 244 tokens reach atomic text commit in eight deliveries and 25 primary RPCs', async () => {
  const f = await fixture('zh'); const provider = f.s.provider;
  f.s.segmentChinese = () => [...Array(121).fill('清晨'), ...Array(123).fill('风')];
  f.s.provider = () => ({ ...provider(), async writeScene(input) {
    return { ...await provider().writeScene(input), text: '清晨'.repeat(121) + '风'.repeat(123), plotWords: [] };
  } });
  const transport = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = async (url, request) => { calls.push(String(url).split('/').at(-1)!); return transport(url, request); };
  try { await f.primary(); } finally { globalThis.fetch = transport; }
  const edge = (await db.query('select epoch,revision from public.generation_edge_state where job_id=$1', [f.row.job_id])).rows[0];
  assert.deepEqual(edge, { epoch: 8, revision: 7 });
  const primaryCalls = calls.filter(name => name.startsWith('edge_'));
  assert.equal(primaryCalls.length, 25);
  assert.equal(primaryCalls.filter(name => name === 'edge_claim_generation_job').length, 8);
  assert.equal(primaryCalls.filter(name => name === 'edge_checkpoint_generation_stage').length, 7);
  assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'queued' });
  const node = (await db.query('select text,text_segments from public.story_nodes where created_by_job_id=$1', [f.row.job_id])).rows[0];
  assert.equal(node.text.length, 365); assert.equal(node.text_segments.length, 244);
  assert.ok(node.text_segments.every(token => token.reading && token.meaning === null));
});

for (const interruptedNext of ['prepare', 'commit']) {
  test(`lost combined ${interruptedNext} checkpoint response resumes without repeating model or billing`, async () => {
    const f = await fixture(); const transport = globalThis.fetch; let lost = false;
    globalThis.fetch = async (url, request) => {
      const response = await transport(url, request);
      const body = JSON.parse(String(request?.body ?? '{}'));
      if (!lost && String(url).endsWith('/edge_checkpoint_generation_stage')
        && body.p_next === interruptedNext && body.p_output.preparation) {
        lost = true; throw Error('Lost successful combined checkpoint response');
      }
      return response;
    };
    try { await f.primary(); } finally { globalThis.fetch = transport; }
    assert.equal(lost, true);
    // Read the persisted phase on redelivery, including an extra duplicate.
    await f.primary(); await f.run();
    assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'queued' });
    assert.deepEqual(f.counts, { plan: 1, write: 1, lookup: 0, gloss: 0 });
    await f.drain(); assert.equal((await f.state()).settles, 1);
  });
}
test('background lookup retries independently and a lost final response never repeats gloss or billing', async () => {
  const f = await fixture(); await f.primary();
  const lookup = f.enrichmentStore.lookup; let fail = true;
  f.enrichmentStore.lookup = async (...args) => { if (fail) { fail = false; throw new StoreUnavailable('fixture dictionary unavailable'); } return lookup(...args); };
  await f.run(f.queue.shift()!);
  assert.equal((await f.state()).status, 'completed'); assert.equal((await f.state()).enrichment, 'queued');
  const failure = (await db.query('select failures from public.generation_enrichment_jobs where job_id=$1', [f.row.job_id])).rows[0]; assert.equal(failure.failures, 1);
  await db.query('update public.generation_enrichment_jobs set next_attempt_at=now() where job_id=$1', [f.row.job_id]);
  const transport = globalThis.fetch; let lost = false;
  globalThis.fetch = async (url, request) => { const result = await transport(url, request); if (!lost && String(url).endsWith('/enrichment_commit')) { lost = true; throw Error('Lost committed response'); } return result; };
  try { await f.drain(); } finally { globalThis.fetch = transport; }
  assert.equal(lost, true); await f.run({ jobId: f.row.job_id, kind: 'enrichment' });
  assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'completed' }); assert.equal(f.counts.gloss, 1); assert.equal(f.counts.write, 1);
});
test('invalid background gloss fails only enrichment, leaving text and original settlement intact', async () => {
  const f = await fixture(); const provider = f.s.provider;
  f.s.provider = () => ({ ...provider(), async resolveGlosses() { f.counts.gloss++; return []; } });
  await f.primary(); await f.drain(); await f.run({ jobId: f.row.job_id, kind: 'enrichment' });
  assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'failed' });
  assert.equal(f.counts.gloss, 1); assert.equal(f.counts.plan, 1); assert.equal(f.counts.write, 1);
});
test('enabling feature mid-job preserves legacy mode; disabling retains already-pinned async mode', async () => {
  const legacy = await fixture(); legacy.s.asyncDictionary = false;
  legacy.store.lookup = legacy.enrichmentStore.lookup;
  await legacy.run(); legacy.s.asyncDictionary = true; await legacy.run(legacy.queue.shift()!);
  assert.equal((await db.query('select phase from public.generation_edge_state where job_id=$1', [legacy.row.job_id])).rows[0].phase, 'enrich');
  await legacy.drain(); assert.equal((await legacy.state()).status, 'completed'); assert.equal((await legacy.state()).enrichment, null);
  const modern = await fixture(); await modern.run(); modern.s.asyncDictionary = false; await modern.run(modern.queue.shift()!);
  assert.equal((await db.query('select phase from public.generation_edge_state where job_id=$1', [modern.row.job_id])).rows[0].phase, 'prepare');
  await modern.drain(); assert.equal((await modern.state()).enrichment, 'completed');
});

test('lost primary commit response leaves a durable enrichment wake and never rewrites or recharges text', async () => {
  const f = await fixture(); const transport = globalThis.fetch; let lost = false;
  globalThis.fetch = async (url, request) => { const response = await transport(url, request);
    if (!lost && String(url).endsWith('/edge_commit_generated_text')) { lost = true; throw Error('Lost primary commit response'); }
    return response;
  };
  try { await f.primary(); } finally { globalThis.fetch = transport; }
  assert.equal(lost, true); assert.equal(f.queue.length, 0);
  assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'queued' });
  await f.run(); await tick(f.s); await f.drain();
  assert.deepEqual(await f.state(), { status: 'completed', settles: 1, nodes: 1, enrichment: 'completed' });
  assert.equal(f.counts.plan, 1); assert.equal(f.counts.write, 1); assert.equal(f.counts.gloss, 1);
});
