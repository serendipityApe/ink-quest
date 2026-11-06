# Isolated Free-plan canary

Local workerd tests verify compatibility, not Cloudflare CPU enforcement. This
canary makes the next measurement concrete without production data or paid
model/speech calls. Its configuration and source are separate from production.

**Completed 2026-11-06:** six messages, all `ok`, provider CPU 0–21 ms,
startup 366 ms, backlog 0. See [actual results and limits](CPU-RESULTS.md).
The three experiment workflows are now manual-only, with no automatic reruns.

The existing task authorization covers these isolated resources after the
Free-plan, existing-permission and production-isolation checks below succeed:

- Worker: `inkquest-generation-cpu-canary`.
- Queue: `inkquest-generation-cpu-canary-20261106` (never `inkquest-generation`).
- Existing Cloudflare account and existing deployment authorization only. No
  Worker secrets or new authentication. The current local Wrangler token is
  expired; do not run login or introduce a replacement token automatically.
  The isolated feature-branch CI action uses the existing repository deployment token.
  Queue create accepts Workers Scripts Write or Queues Write. Test the existing
  authorization with the legitimate create request; do not expand
  permissions or replace the token automatically if an API returns denial.
- No routes, workers.dev, preview URLs, HTTP handler, Cron or producer. Consumer
  concurrency/batch size 1, retries 0. No database or application credit access.

The user supplied a screenshot showing Free as the current plan ($0, 100,000
requests/day, 10 ms CPU/request), and confirmed it belongs to the target account.
This establishes plan evidence, not remaining daily quota. The billing endpoint
previously returned 403; never repeat it or require additional billing permission.

After confirming Free-plan evidence and reading resource inventories, build
with `pnpm --filter @inkquest/generation-worker build:canary`. Review
`wrangler.canary.jsonc` before any real deployment. Do not raise `cpu_ms` or change
the plan. `.github/workflows/run-generation-cpu-canary.yml` was triggered once on
the isolated feature branch and is now manual-only. It installs/builds before
exposing the existing token to the final control-plane step. It fails
closed if either canary resource already exists, and stops at any API denial.

The current one-shot script sends these six fixed cases once each (6 messages,
roughly 18 Queue operations absent duplicates), through the isolated queue.
It sends only `zh-short` first, and requires provider CPU joined by request ID to
that fixture's completion log before sending another case. It stops if CPU is
unavailable or an invocation fails. The absolute authorization ceiling remains
30 messages, with no automatic reruns or message retries:

```json
{"caseId":"zh-short"}
{"caseId":"zh-paragraph"}
{"caseId":"zh-long"}
{"caseId":"en-short"}
{"caseId":"en-paragraph"}
{"caseId":"en-long"}
```

All text is fixed public prose in `src/canary.ts`; message bodies cannot supply
user text or destinations. Each invocation runs the actual segmentation,
pinyin, learner tiers and enrichment code with a bounded synthetic dictionary,
including JSON serialization/parsing. It never calls a model, speech provider,
Supabase, or any external URL. It retains the production dependency graph so
startup validation includes those imports. The only logs are case ID, token
count, WASM linear-memory size and a zero-network marker.

Use Cloudflare Workers Logs/observability for each Queue invocation, linked to
the exact deployed version and case ID. Record provider-reported CPU time and
wall time, invocation outcomes, cold starts, and any `exceededCpu` or
`exceededMemory` outcome. Compare median/p95/max against the **actual Free Queue
limit reported for the account**, rather than assuming the HTTP or Paid limit.
The local `performance.now()` timer is not a CPU billing measurement.

Record startup time from actual upload validation. WASM linear memory is only
part of the 128 MB isolate allowance; zero memory-limit failures in this bounded
run is useful evidence, not a measurement of total peak memory or a promise for
unbounded/concurrent workloads. Keep concurrency 1. Production dictionary HTTP
and larger real model responses add parsing work, so retain headroom and bound
those inputs. Narration CPU/audio quality requires a separate synthetic Speech
protocol test on Cloudflare before enabling TTS; text-only can be evaluated first.

If an outcome exceeds a limit, report the exact version, case and measurement.
Do not upgrade or turn on another platform. Possible next work is smaller
durable enrichment batches after verifying token-boundary equivalence. Never
infer Free success merely from a successful local run or bundle size.

The script reports exact completed actions, resource identity, upload startup
time, message count, provider CPU/outcomes and the first blocker in the GitHub
step summary and a sanitized annotation. Deployment/execution and CPU validation
remain separate claims until the actual CI result is observed. It never calls
the refused subscription endpoint or any token-management endpoint.
