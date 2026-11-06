# Prepared Free-plan canary — not run on Cloudflare

Local workerd tests verify compatibility, not Cloudflare CPU enforcement. This
canary makes the next measurement concrete without production data or paid
model/speech calls. Its configuration and source are separate from production.

The existing task authorization covers these isolated resources after the
Free-plan, existing-permission and production-isolation checks below succeed:

- Worker: `inkquest-generation-cpu-canary`.
- Queue: `inkquest-generation-cpu-canary-20261106` (never `inkquest-generation`).
- Existing Cloudflare account and existing deployment authorization only. No
  Worker secrets or new authentication. The current local Wrangler token is
  expired; do not run login or introduce a replacement token automatically.
  An approved manual CI action can use the existing repository deployment token.
  Verify that token already has the required Queue permission; do not expand
  permissions or replace the token automatically if an API returns denial.
- No routes, workers.dev, preview URLs, HTTP handler, Cron or producer. Consumer
  concurrency/batch size 1, retries 0. No database or application credit access.

After read-only verification that the account remains on Workers Free, build
with `pnpm --filter @inkquest/generation-worker build:canary`. Review
`wrangler.canary.jsonc` before any real deployment. Do not raise `cpu_ms` or change
the plan. There is deliberately no workflow that creates these resources.

Send only these six fixed cases, at most five copies each (30 messages, roughly
90 Queue operations absent failures), through the isolated queue:

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

This document is a pending validation procedure. No remote canary resources,
messages, authentication, fees or measurements have been created by it.
