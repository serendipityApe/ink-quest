# Text-first dictionary enrichment

Use the rollout and verification steps below. Source code alone does not establish the current production state.

## Behavior

`GENERATION_ASYNC_DICTIONARY=true` selects the new mode for new generation jobs:

1. Plan/write, then bounded token preparation (384 UTF-16 units per segmentation step and 64 tokens per pinyin step).
2. Commit text, frozen token boundaries, choices, story state, text credit settlement, and a durable enrichment job in one transaction.
3. Return text/choices immediately. Dictionary reads and missing-meaning resolution proceed through a separate leased job/outbox. They hold no primary generation or branch lock and never modify billing.
4. Update only lexical fields on the same node ID, node version, text hash, and ordered-token hash. Audio IDs and word timings are preserved in either completion order.

Chinese pinyin is available with the initial text. English IPA and dictionary levels/meanings arrive with enrichment. Base/function words and punctuation need no dictionary lookup unless explicitly marked as a plot keyword. Plot keywords retain meaning and reading support, including base-word overrides. The dictionary is retained. Missing or failed meanings never open an empty word card or save an empty vocabulary entry.

The existing optional narration job and its credit settlement are unchanged. Its existing branch-lock behavior remains until narration settles; dictionary work adds no such lock. An unfinished glossary does not make successful text generation fail or cause a second text charge. Every background write takes a short parent-job key-share lock before its own row/node locks, matching audio lock order and avoiding deferred-foreign-key deadlocks. This lock ends with the database transaction and is never held across dictionary/model calls. Paid glossary calls retain the existing in-flight ambiguity rule: an uncertain upstream outcome is not automatically replayed.

## Compatibility and rollout order

1. Apply `supabase/migrations/202611100003_async_dictionary_enrichment.sql` under the production change authorization. It adds the independent job table, private service-role RPCs, node status metadata, and preparation/version validation. No dictionaries are deleted and no historical jobs are rewritten.
2. Deploy the worker and frontend only after the migration is verified. The frontend now selects `story_nodes.model_metadata`; it is not compatible with an unmigrated schema. New background recovery RPCs also require the migration.
3. Enable `GENERATION_ASYNC_DICTIONARY=true` on the worker after verification. The production Wrangler setting must match the reviewed activation request. The readiness heartbeat still requires a functioning story provider, but dictionary service failure no longer closes text readiness in this mode.
4. Verify one explicitly authorized live text-only generation and its single credit settlement before wider rollout. A local mock benchmark is not production latency or Cloudflare CPU evidence.

Mode is pinned in each job's fingerprint. Enabling the flag mid-job preserves an existing legacy job's path. Disabling it stops selecting async mode for new jobs but the new worker continues processing/recovering existing async jobs. Roll back new-job selection with the flag; do not roll back the migration or replace the worker with a version that cannot understand pending background jobs.

The frontend polls owner-scoped lexical status independently, checks node ID/version/text/word boundaries before merging, never changes the selected branch during refresh, and limits a polling session to 120 attempts. Failed/stale jobs stop polling; reopening a story obtains current state.

## Combined preparation update

Apply `202611110004_combine_preparation_checkpoints.sql` before deploying the worker with combined checkpoints. This migration replaces only the fenced preparation checkpoint RPC and retains its service-role-only access. Existing workers and unfinished jobs remain compatible. It changes no table, historical story, dictionary, or credit balance.

The write checkpoint now includes empty preparation state. The last bounded rendering batch checkpoints its final preparation and commit-ready tokens together. Segmentation remains limited to 384 UTF-16 units and rendering to 64 tokens per delivery. For a 365-unit / 244-token fixture, primary processing takes 8 deliveries and 25 database RPCs instead of 10 and 31. These are verified operation counts, not a production latency measurement.

Validate the exact release commit using offline tests, native PostgreSQL multi-session tests and a complete web build; then independently verify the installed migration before worker deployment. Roll back the worker to its preceding compatible async-dictionary version if necessary, leaving migration 004 installed. Do not restore the pre-004 function while a combined-checkpoint worker can still run. No new paid production story is required by this update's deployment checks.

The reader unlocks choices once a terminal job's committed story has loaded, without waiting for balance refresh. Balance failures do not lock an already committed scene. Superseded balance/story requests and old navigation cannot overwrite newer state; branch POSTs retain their server-enforced credit checks and idempotency key.

## Offline verification

- Worker/SQL suite includes duplicate delivery, lost commit responses, immutable node/text/word fencing, invalid glossary, bounded lookup retries, spent-credit preservation, branch creation while glossary is pending, and both audio/gloss completion orders.
- Preparation tests include supplementary Chinese characters, emoji, and the ECMAScript whitespace set so SQL cursor checks match JavaScript UTF-16 semantics.
- `test:runtime` runs the actual workerd runtime, native/WASM token parity, dictionary readiness failure isolation, and a local Speech SDK fixture.
- `test:queue:async` runs the production bundle against local Queues, isolated PostgreSQL/PGlite, fake model/speech endpoints, and duplicate initial messages. No external models, production Queue, real database, or real speech service is used.
- `test:queue` retains the legacy queue path. Existing LLM, TTS, billing and reader tests remain applicable.

PGlite has one session; its checks do not establish multi-session native PostgreSQL concurrency. The separate native PostgreSQL job below covers transaction races. Neither test suite establishes production CPU limits; actual production latency and provider billing are not measured.

## Isolated cloud release checks

The existing development-branch verification workflow also prepares a full `pnpm build` with synthetic Supabase settings and a separate PostgreSQL 17 service. Neither job references production secrets, changes the production database, or deploys anything.

`node tools/generation-worker/tests/postgres-concurrency.mjs` exercises twenty-three transaction and privilege cases, including combined-checkpoint replay and an in-progress migration-003 job resumed after migration 004, using independent psql processes and verified `pg_blocking_pids` barriers. It refuses non-loopback hosts, any database name other than `inkquest_test`, and nonempty databases. CI owns the disposable service lifecycle. Local syntax validation is not a concurrency result. Require successful `postgres-concurrency` and `full-web-build` jobs for the exact development-branch commit before treating these checks as passed.
