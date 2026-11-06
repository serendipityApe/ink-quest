import assert from "node:assert/strict";
import {test} from "node:test";
import {SupabaseEdgeStore,StoreUnavailable} from "../src/store.js";
import type {Lease} from "../src/contracts.js";
const lease={job:{jobId:"fixture-job"},owner:"fixture-owner",epoch:1} as Lease;
test("SQL void RPCs accept real PostgREST 204 empty responses",async t=>{
  t.mock.method(globalThis,"fetch",async()=>new Response(null,{status:204}));
  const store=new SupabaseEdgeStore("https://database.invalid","fixture-key");
  await store.begin(lease);await store.recover();await store.published({jobId:"fixture-job",revision:1});
  await store.commitAudio(lease,{} as never);
});
for(const status of [200,204])test(`nonvoid RPCs reject an empty HTTP ${status} result`,async t=>{
  t.mock.method(globalThis,"fetch",async()=>new Response(null,{status}));
  const store=new SupabaseEdgeStore("https://database.invalid","fixture-key");
  await assert.rejects(store.claim("fixture-job","fixture-owner"),StoreUnavailable);
  await assert.rejects(store.pending(),StoreUnavailable);
});
