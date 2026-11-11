# Creem credit-lot migration: review and maintenance plan

Prepared only. This document, its plan generator and checks do not authorize or
execute production actions. Keep purchases disabled until the real sandbox
checkout → signed webhook → credit grant → receipt → refund/cancel path passes.
Do not publish a new commit merely to evade a denied CI rerun.

## Current read-only observation

2026-11-11 10:08:07 UTC, the existing linked Supabase management connection:
19 stories, 23 nodes, 15 credit accounts, 9,578 available / 0 reserved credits,
58 ledger entries. Queued/running generation, open reservations, pending outbox,
queued/running enrichment, other active transactions and ledger/account mismatch
counts were all zero. Migration 006 and credit lots were absent. These facts are
observations, not a lock or assurance that subsequent traffic remains idle.

The original live function ACL for `grant_credits`, `release_credit_reservation`
and `settle_credit_reservation_item` is owner `postgres` plus EXECUTE for
`service_role`; no `anon`/`authenticated` access. Private snapshot is outside the
repository. Re-read immediately before any approved operation; do not commit
private snapshots or credential material.

## Why a short write-maintenance window is required

CREATE OR REPLACE does not guarantee that an invocation already executing the old
PL/pgSQL body switches to the new body. An old grant/release/settle waiting on an
account lock could otherwise resume without updating the new lot allocations.
Zero queued/running jobs alone is insufficient evidence.

The current `ensure_generation_backend_ready` reads the backend row FOR SHARE,
held through reservation creation. Turning that row's `active` flag off waits for
already-admitted generation transactions, then rejects new opening/branch jobs.
The readiness heartbeat updates timestamps/capabilities, **not** `active` or
`consumer_verified`; it cannot silently reopen this gate. Existing workers remain
running to drain queued/model/audio work. Do not stop the worker before draining.

The legacy Lemon Squeezy webhook can still call `grant_credits`; production has
legacy orders/subscription records. Do not assume that route is unused. During
the approved window temporarily revoke only the existing `service_role` EXECUTE
on that one function, preserving all other ACLs. A legacy notification arriving
then must fail rather than be acknowledged as fulfilled. Check provider delivery
history after restoration; do not assume automatic retry already succeeded.
New Creem/starter endpoints must not be deployed/open before this migration.

## Proposed sequence (not executed)

1. Verify exact committed SHA, all required CI including real PG concurrency,
   source hashes for migrations 004/005, current release, credential/project
   identity, current function definitions/ACLs and the closed-purchase flags.
   Read `supabase/checks/creem-credits-preflight.sql` through the approved linked
   connection. No model calls, test purchases or synthetic users in production.
2. After explicit rollout approval, in a short transaction set only backend
   `active=false` and revoke only the direct `service_role` grant function access.
   Snapshot exact original state and prepare restoration before doing this.
   Use `lock_timeout=2s`; never kill another session or reset data to get the lock.
3. Let current worker jobs and enrichment finish. Verify all relevant counters
   remain zero, and that no old monetary-function transaction remains in progress.
   The legacy revoke and backend pause must be independently read back. A mere
   setting named `operator-confirmed` is not evidence.
4. Generate and review the **default rollback** bundle:
   `node scripts/prepare-creem-migration.mjs /tmp/inkquest-creem006-plan`.
   This reads repo SQL only, performs no network operation and writes no secrets.
   Run only within the approved maintenance window. Its SQL requires the reviewed
   session attestation `inkquest.migration_writes_quiesced=operator-confirmed`,
   verifies the actual gates, takes bounded exclusive locks, snapshots existing
   funds/content/functions, applies migration 006 and records its source in the
   migration history, asserts invariants and **ROLLBACKs** everything.
5. If dry run passes and readback confirms no change, review the commit variant
   generated explicitly with `--emit-commit-plan`. The generator still does not
   execute it. Verify its migration SHA matches the exact tested commit. Execute
   once through the authorized management path with ON_ERROR_STOP behavior.
   Lock timeout/deadlock/error aborts the whole transaction; an uncertain network
   result requires independent readback, never an automatic repeat.
6. Run `supabase/checks/creem-credits-postflight.sql`. Check source hash 006,
   changed-function attributes and ACLs, unchanged unrelated definitions,
   account/lot/reservation invariants and unchanged account digest, story/node
   counts and ledger count. No free-credit claims or new payments should exist
   merely because migration ran.
7. Restore the exact former grant ACL and backend `active` state. Confirm consumer
   verification and a fresh heartbeat; do not overwrite capability/dictionary
   values. Observe backend availability and failed legacy webhook deliveries.
8. Deploy compatible frontend with purchases still disabled, then perform the
   separately authorized sandbox E2E and only enable live sales after it passes.

Target the idle maintenance interval at roughly 1–3 minutes, not a guarantee.
Database statements are capped at 30 seconds and lock waits at 2 seconds; network,
management API latency, existing jobs or a failed gate can make it longer. If
quiescence is not reached promptly, restore the saved gates and reschedule instead
of leaving generation unavailable or terminating work.

## Failure / rollback

Before COMMIT, a SQL failure or disconnected transaction must roll back. Confirm
with read-only schema/history/fund checks, then restore the saved intake gates.
After a confirmed COMMIT, do not drop lots or restore old monetary functions:
new reservations/credits may already rely on them. Keep purchases disabled, use a
compatible web rollback, and forward-fix under review. No reset, balance overwrite,
restore-from-old-counts, job cancellation or duplicate migration is permitted.

## Compatibility and invariants

The existing Worker RPC signatures and ledger entry types remain unchanged. Old
Workers starting calls **after** migration use the new allocation-aware functions.
Existing balances are backfilled as nonexpiring legacy lots, not newly granted.
The migration supports existing reservations in isolated tests, but production
rollout intentionally requires a drained window to avoid old-body execution.
Monthly expiry affects only unreserved monthly funds; expired/rescinded reserved
funds cannot return as permanent credit. Topups and unrelated balances survive
subscription cancellation/refund. Failed assertions are investigation triggers,
not permission to "repair" money or story data automatically.

The `supabase/operations/*.review.sql` files are **mutating drafts**, not checks.
They include explicit attestation gates and exact original definition/ACL/backend
checks. They have not been executed. Do not set their attestation merely to make a
script run; the approvals, maintenance window and independent readback must exist.
The linked management query transport may not preserve session settings across
calls, so an approved operator would include the reviewed setting and SQL in the
same query batch. Never invent a connection URL or extract credentials to bypass
that transport.
