# InkQuest generation Worker — prepared, inactive

This implementation stays on ordinary Cloudflare Workers and the existing
Supabase project. It does not require Containers, GCP, R2, D1, KV or a plan
upgrade. The supplied Wrangler configuration has generation disabled, no Queue
bindings, no Cron, no routes, workers.dev disabled, preview URLs disabled, and
no HTTP `fetch` export. The separate HTTP test harness is never deployed.

The main opening/branch APIs call readiness-gated creation RPCs. For a new
request, the same transaction checks manual activation/consumer verification,
a heartbeat newer than three minutes, dictionary readiness and the requested
language/narration capabilities before reserving credits. Existing owned
idempotent requests replay their original IDs even when paused, without another
reservation or immediate enqueue. A missing readiness migration fails closed;
there is no fallback to legacy creation RPCs. The heartbeat function cannot
activate the backend, although the privileged service-role credential can update
the status table and must be treated accordingly.

## Execution and recovery

An opening advances through plan → write → enrich → gloss → commit → optional
audio, with one phase per delivery. Scene continuations skip planning. Model,
prompt and dictionary versions are pinned across checkpoints. Known dictionary
readings, candidate meanings and the existing HSK/ECDICT-derived CEFR rules are
retained. A dictionary lookup requires a verified, explicit version; a missing
dictionary cannot be reported as successful enrichment. All non-base tokens
must have a meaning before text can be committed. Individual out-of-vocabulary
readings/levels may remain null, as in the existing pipeline; they are not
fabricated. The complete dictionary is never loaded into a Worker.

The stage lease lasts 150 seconds. Model requests allow one 75-second attempt;
database requests use 10-second timeouts; narration has a 90-second outer limit.
The reservation's expiration is the overall deadline. No lease-renewal API is
needed for these bounded stages. Database RPCs fence owner **and** lease epoch,
check expiry and active reservations, and reuse existing atomic credit commit /
release functions. Terminal checkpoints discard duplicated story content.

Outbox creation and phase advancement happen in the same transaction. Publication
marks an outbox revision only after Queue send succeeds. Repeated publication
and delivery are safe. A busy claim explicitly retries; terminal/missing claims
ACK. The scheduled handler recovers expired running leases, expired queued
reservations and queued jobs whose published message was lost. A working Cron
trigger is therefore required before production activation; source code alone
does not schedule recovery.

Before a potentially paid call, a durable in-flight marker is written. If the
process dies after upstream acceptance but before saving its result, recovery
records an explicit failure (or partial success after text), rather than
automatically issuing another possibly charged call. Definite rate-limit
rejections may retry, bounded by max attempts and the overall deadline. Client
timeouts do not prove upstream rejection: application credit idempotency cannot
guarantee exactly-once upstream billing.

Azure narration uses the real browser Speech SDK, a scoped Workers WebSocket
adapter and the existing word-boundary alignment logic. It uploads to the
existing private `generated-audio` bucket. Missing spoken-word boundaries fail;
no estimated timing fallback is used. **Tencent's ffmpeg-based multi-part MP3
path is unsupported in this Worker.** Selecting it fails preflight before any
story-model request. The existing Node pipeline is preserved for that path.
Actual Azure audio quality and real model latency have not been tested here.

## Offline validation

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @inkquest/generation-worker typecheck
pnpm --filter @inkquest/generation-worker test
pnpm --filter @inkquest/generation-worker build
pnpm --filter @inkquest/generation-worker test:runtime
pnpm --filter @inkquest/generation-worker test:queue
```

Tests use synthetic credentials, local Queues, local WebSocket/model fixtures
and isolated PGlite PostgreSQL. Outbound network access from test Workers is
blocked. PGlite substitutes only pgcrypto snapshot hashing with a fixture hash;
the generation/credit migrations and new RPCs run as SQL. PGlite uses one session,
so transaction-order/fencing checks do not replace a multi-session concurrency
test against native PostgreSQL. The `PGLITE_MODULE` test-only override can point
at an unpacked local PGlite package. The `verify-generation-worker.yml` workflow
runs these tests without deployment credentials or production bindings.

The workerd tests include native/WASM token equality on 12 public Chinese
sentences/paragraphs, pinyin/IPA/meaning/level fixtures, unavailable dictionaries,
the real Speech SDK against a local protocol fixture, and absent boundaries.
The queue integration runs the actual production bundle through text and TTS
jobs against real local SQL, including duplicated initial delivery.

Local workerd compatibility **does not establish Workers Free CPU compliance**.
Its timer readings are not Cloudflare CPU billing measurements. Observed WASM
linear memory was 61,734,912 bytes (58.9 MiB); JS heap, SDK and concurrent work
also consume the 128 MB isolate allowance. Production consumer batch size and
concurrency should start at 1. Keep the current Free plan; do not increase CPU
limits to Paid settings or claim Free suitability without measured evidence.
The [isolated Cloudflare results](CPU-RESULTS.md) now record six successful fixed
fixtures on the user-confirmed Free account, with provider CPU 0–21 ms and
366 ms upload startup. This is bounded Queue evidence, not a 10 ms HTTP guarantee
or a measurement of total peak heap. The [CPU procedure](CPU-VALIDATION.md) and
manual-only experiment workflows preserve the isolation checks. No total-heap
measurements have been obtained.

## Dictionary preparation and capacity

```sh
python3 prepare_dictionary.py --data-dir /path/to/existing/data --output-dir /tmp/inkquest-dictionary
node measure_dictionary.mjs /tmp/inkquest-dictionary
```

These commands only prepare/import into an isolated local database. They do
not connect to Supabase. All three nonempty source files are required. The
manifest records source URLs, licenses, SHA-256 checksums, derived version and
expected row counts. Preserve source headers and the CC-CEDICT share-alike /
HSK attribution requirements when distributing or importing their data. CEFR
remains the existing frequency/Collins heuristic, not an official classification.

For the existing files measured on 2026-11-06:

| Item | Result |
|---|---:|
| Chinese entries | 121,446 |
| English entries | 770,611 |
| Total entries | 892,057 |
| Prepared CSV | 84,100,069 bytes |
| Local PostgreSQL heap | 110,821,376 bytes |
| Primary-key index | 105,037,824 bytes |
| Total physical allocation | 215,916,544 bytes (205.9 MiB) |

This is a local size measurement, not the current project's usage or a promise
that its free capacity is sufficient. Check live database size and allow import,
index, checkpoint/history and maintenance margin before any real import. No
dictionary has been imported into Supabase. Import into an unready version,
verify the complete row count and both languages, then activate the version.

## Production gates — backend deployed disabled

On 2026-11-06, the operator explicitly approved transferring the existing
Supabase service-role secret and local OpenAI key to `inkquest-generation-worker`
only, without configuring speech. The [disabled deployment](https://github.com/serendipityApe/ink-quest/actions/runs/42273373946)
created that Worker, set its Supabase secret and verified `GENERATION_ENABLED=false`,
no Queue binding, no Cron and disabled public/preview URLs. Upload startup was
364 ms. After separate explicit approval to restore local OAuth, Wrangler 4.112.0
was authenticated with only `workers_scripts:write` plus its automatically added
`offline_access`. The existing local OpenAI key was then transferred directly to
this Worker's `OPENAI_API_KEY`; it was not persisted in GitHub or another relay.
The resulting active version is `2ad0dee3-41bd-472f-9831-b45c02c27663` (100%).
Post-write metadata verified both secret names/types, disabled generation, no
Queue binding, no Cron and disabled public/preview URLs. No model request was
made. No speech credential was configured. `OPENAI_MODEL` remains unset until the
intended model configuration is established; readiness must remain closed.

The prepared SQL tables/RPCs were confirmed absent by a read-only schema check.
Database size, migration and dictionary import still need an authorized SQL
management connection; no SQL credential is currently configured locally.
The old task remains queued with attempt 0, 20 reserved/0 settled and an expired
reservation, so production consumer/recovery activation remains prohibited until
the approved cancellation is safely executed. The operator has now chosen to
cancel that exact unprocessed task and release its 20-credit reservation, but no
atomic cancellation RPC or authenticated SQL management channel is available.
The reviewed one-off SQL and regression fixtures stay outside this public
repository because they contain private account/job identifiers. No old task or
accounting row was changed. Restoring Cloudflare OAuth did not establish a
Supabase SQL connection, and no Supabase PAT has been created.

1. Read only the current metadata for the pre-existing queued job and its
   reservation identified in the deployment review. Obtain the operator's explicit decision
   to retain execution or cancel/release. The previous reservation was expired;
   keeping it requires a reviewed deadline-repair plan before enabling recovery.
   **Do not attach a production consumer or Cron while this decision is pending.**
2. Confirm database capacity for project `irzfnntlixbtccdfjcpm`, approve the
   exact migration/import target and apply the prepared migration. It creates
   no triggers or schedules and invokes no recovery functions on existing jobs.
3. Honor the credential-transfer status for each target below. Do not
   read, log or copy secret values into source/config files.

   | Source | Exact destination | Scope/risk |
   |---|---|---|
   | Existing GitHub Repository Secret `SUPABASE_SERVICE_ROLE_KEY` | Worker `inkquest-generation-worker`, secret `SUPABASE_SERVICE_ROLE_KEY` | Explicitly approved and configured; secret name/type verified without displaying its value. Bypasses RLS; backend remains disabled. |
   | Existing root `.env` definition `OPENAI_KEY` | Worker `inkquest-generation-worker`, secret `OPENAI_API_KEY` | Explicitly approved and directly configured after separately approved local OAuth restoration; name/type verified. No value displayed or intermediate GitHub storage. Can incur model usage once activated. |
   | Existing `tools/story-pipeline/.env.local` definition `AZURE_SPEECH_KEY` | Worker `inkquest-generation-worker`, secret `AZURE_SPEECH_KEY` | Source is present, nonempty and not an obvious placeholder; value not displayed or supplier-validated. Can incur speech usage. Optional for a text-only launch; narration requests remain gated off without it. |

4. Configure nonsecret Supabase URL, explicit model/provider, dictionary version,
   Speech region/voices and validated provider selection. Do not reuse the
   existing Gemini `LLM_API_KEY` as an OpenAI key.
5. Verify CPU/memory with isolated, nonpaid fixtures on the current plan. If the
   plan cannot meet the workload, report the measurements; do not upgrade or
   introduce another service automatically.
6. Only after these gates, add the existing `inkquest-generation` Queue producer
   and consumer (batch/concurrency 1), a recovery Cron such as once per minute,
   and `GENERATION_ENABLED=true`. Review retries/retention and retain outbox
   recovery; Queue retention expiry does not release application reservations.
   Verify bindings, set the backend status activation/consumer-verification flags
   only after approval, and confirm a fresh capability heartbeat. Deactivate the
   status row before intentionally stopping consumers. Apply both prepared
   migrations; heartbeat alone does not authorize activation.

The main site's Wrangler config and automatic deployment workflow are unchanged.
The new backend deployment is disabled and its configuration workflow is now
manual-only. Both approved Supabase/OpenAI secrets have been configured on that backend;
no production job, reservation or consumer has changed. Keep main's readiness gate
closed until the SQL, dictionary, OpenAI configuration and old-task decision are
complete, then perform the separately authorized minimal text-only end-to-end test.
