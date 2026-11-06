# Cloudflare Queue CPU canary — 2026-11-06

Six fixed public fixtures completed on the user-confirmed Free account, all with
provider outcome `ok`. These are Cloudflare invocation CPU measurements, not local
elapsed timers. No model, speech or database service was called. The production
generation consumer, recovery Cron, application credentials and old job were not
activated or changed.

- Account: `fdfece8b5c135c21fa630440b8dbf2e4`.
- Worker: `inkquest-generation-cpu-canary`.
- Queue: `inkquest-generation-cpu-canary-20261106`, ID `f5408177e3c3462fac2746874902f80d`.
- Actual deployed version: `15257c85-76e5-46a8-8029-2ad7d3e0be84`.
- Deployed source: `5a942e9060e7bb158f51b36145aa6beae821cc1e`.
- Upload startup validation: **366 ms**, below the documented 1-second startup limit.
- Consumer: batch 1, concurrency 1, retries 0. Public/preview URLs false, bindings empty.
- Exactly **6 accepted messages** total: first `zh-short`, then the remaining five.
- Final queue metrics: backlog count 0, bytes 0. Isolated resources remain idle.

| Fixture | Tokens | CPU ms | Wall ms | Outcome |
| --- | ---: | ---: | ---: | --- |
| zh-short | 26 | 3 | 4 | ok |
| zh-paragraph | 260 | 8 | 8 | ok |
| zh-long | 1,820 | 21 | 21 | ok |
| en-short | 15 | 1 | 2 | ok |
| en-paragraph | 150 | 0 | 1 | ok |
| en-long | 1,500 | 7 | 8 | ok |

Across these six different fixtures, median CPU is 5 ms, nearest-rank p95/max
21 ms. One observation per fixture is descriptive, not a reliable production
latency distribution. The provider's reported 0 ms does not mean no CPU work.
No sampled invocation reported `exceededCpu` or `exceededMemory`.

The current [Queues limits](https://developers.cloudflare.com/queues/platform/limits/)
page describes a default 30-second consumer CPU limit and says its limits apply
to Free and Paid except specified queue-count/retention differences. The separate
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
page lists 10 ms for Free HTTP requests. We did not set `limits.cpu_ms`, change
the plan or test an HTTP handler. The 21 ms successful Queue result must not be
presented as proof that this workload fits a 10 ms HTTP budget.

Every fixture reported WASM linear memory **61,734,912 bytes** (58.9 MiB). This is
not total peak isolate memory; JavaScript, SDK and temporary JSON data also use
the 128 MB allowance. Production dictionary HTTP responses, full model responses,
provider network behavior, actual Azure narration and sustained concurrency were
not exercised. Remaining daily request/Queue quotas were not established. This
experiment supports bounded Queue compatibility on the current Free account,
not unrestricted production capacity or production readiness.

## Evidence and sampling corrections

The [first run](https://github.com/serendipityApe/ink-quest/actions/runs/42266553382)
created the resources and accepted only `zh-short`. It stopped after failing to
correlate CPU because the platform places request IDs in `$metadata.requestId`,
not `$workers.requestId`. A [read-only inspection](https://github.com/serendipityApe/ink-quest/actions/runs/42267217878)
found the matching fixture/invocation ID, CPU 3 ms and successful outcome.

An initial [continuation preflight](https://github.com/serendipityApe/ink-quest/actions/runs/42267701707)
accepted **zero** additional messages: consumer list uses `script`, whereas create
returns `script_name`. The correction matches Wrangler's list handling and still
strictly checks the Worker name, type, batch, concurrency and retries. No remote
configuration was relaxed or changed.

The [successful continuation](https://github.com/serendipityApe/ink-quest/actions/runs/42267980479)
verified the existing active version and first sample before sending only the
remaining five. [Saved sanitized platform evidence](cpu-canary-result-20261106.json)
retains all sample request IDs, CPU/wall times, outcomes, version and final metrics.
The continuation refuses an already-continued experiment. All three experiment
workflows are now manual-only; no additional messages or deployments are scheduled.

The [full offline CI](https://github.com/serendipityApe/ink-quest/actions/runs/42267980520)
also passed for the successful continuation commit. Seven additional local checks
cover mutation scope, denial stops, no further send on missing CPU, real telemetry
correlation, read-only inspection and the bounded five-message continuation.
