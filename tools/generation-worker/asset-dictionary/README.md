# Isolated lexical assets experiment

This directory is an experiment. Production generation is not wired to it.
Do not mark the partially imported SQL dictionary ready to enable this reader.

The existing verified CSV contains 121,446 Chinese and 770,611 English entries.
Packaging uses 8,192 FNV-1a UTF-8 buckets per language, plus a small manifest and
a 655,360-byte binary integrity catalog. Each catalog record contains a SHA-256,
byte length and row count. Every read verifies its digest before parsing.
Only the manifest and catalog are retained across invocations; shard payloads
are read sequentially and discarded. The source CSV is never downloaded again.

The packer requires attribution and license material. Chinese adapted entries
retain CC-CEDICT's CC BY-SA 4.0 license and original source header. HSK level
attribution retains upstream CC BY 4.0 and the CTI source notice. English data
retains the ECDICT MIT notice. Public fixture words come from these sources;
see the published asset package's `licenses/` directory and source provenance.
Keep these lexical source and license notices alongside the distributed data.

Run `prepare.py --source PREPARED --out NEW_DIR --licenses LICENSE_DIR` locally.
Run `node check.mjs NEW_DIR` to verify all shard digests, bucket assignments,
catalog records, row counts, malformed inputs and fail-closed missing assets.
Its CPU numbers include local filesystem work and are not platform CPU proof.

The first real Free-plan Queue canary used 48 requested words, 50 asset fetches
and 40 ms CPU. It returned correct results, but failed the conservative 10 ms
gate (provider outcome was `ok`; the experiment stopped on its own CPU gate).
The reader is now capped at four words. Its five real isolated fixtures passed:
English cold lookup 9 ms, Chinese lookup 4 ms, readiness 2 ms, corrupt asset 1 ms
and missing asset 1 ms. The last two refused readiness as expected.
Evidence: https://github.com/serendipityApe/ink-quest/actions/runs/42751923847
Version: `8552ec7f-f024-4c2f-a8f1-bce0ae840255`.
Its maximum cold fetch count is six (manifest, catalog, four shards).
The canary has no database, model, credit, app secret or production Queue access.
It reuses the existing private CPU canary Worker and Queue. No plan change is
performed. `verify_remote.mjs --inspect` reads existing correlated CPU events
without deploying or publishing messages.
The workflow is now manual and read-only; its one-shot push trigger is removed.

Before production integration:

- Correlate provider CPU and successful integrity fixtures with the uploaded
  canary version; never infer runtime compliance from a local benchmark.
- Check the complete artifact and immutable Worker deployment. A manifest-only
  lookup is not by itself proof that the entire artifact was published.
- Persist small enrichment steps behind the existing lease/epoch fence. The
  current SQL transition function rejects `enrich:enrich`; it must not be
  silently reused for repeated checkpoints. Test unknown transaction outcomes,
  redelivery, phase completion and credit settlement before changing production.
- Account for all caller and asset-service subrequests across the 2,000-token
  bound. A four-word reader cannot be used in a single whole-scene invocation.
- Add an independently verified asset readiness record. Preserve the existing
  SQL dictionary's data and `ready=false` status. Asset readiness must check the
  pinned manifest digest and deployed version before permitting reservations.
- Exercise the full enrichment graph, including Chinese segmentation memory,
  then run the one previously authorized text-only creation test. No production
  activation follows automatically from this isolated canary.
