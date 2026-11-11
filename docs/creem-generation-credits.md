# Generation credits rollout (2026-11-11)

Products (separate from legacy Founding Reader): verified new accounts receive 100 credits once; Story Creator USD 6/month grants 1,000 per paid billing period, no rollover; USD 5 one-time pack grants 500 non-expiring credits. Prices exclude applicable checkout taxes. Existing balances and membership rights are preserved. No real purchase is needed or authorized for deployment.

## Runtime configuration
Cloudflare `inkquest` Worker secrets: existing `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Never expose or commit their values.
Variables: `CREEM_MODE=prod`, `CREEM_GENERATION_MONTHLY_PRODUCT_ID=prod_3eNA3i8BBxqy0hbJjfJuMw`, `CREEM_CREDITS_500_PRODUCT_ID=prod_2uIgqpQaurNCxGqYLifD23`.
Webhook `/api/webhooks/creem`: checkout.completed, subscription.paid, subscription.active/update/scheduled_cancel/canceled/past_due/unpaid/expired/paused, refund.created, dispute.created. Do not configure test signing secret or products on the live endpoint.

## Security and accounting
Raw-body HMAC-SHA256, timing-safe comparison, explicit environment and product allowlist. Server-owned checkout intents bind identity; no entitlement from redirect URL or customer email. Paid order and subscription-period uniqueness protects against replay and manual resend. Checkout creation is claimed once before provider I/O; uncertain results cannot silently create another session. New monthly intent is blocked while an earlier provider request/active subscription exists. An operator must reconcile uncertain requests with the provider before unlocking them.

Monthly, purchased, starter and legacy credits are separate lots. Reservation allocation is expiry-first; failure returns only still-valid, non-refunded lots. Refund/dispute events reverse only the matching purchase; partial refund uses cumulative refunded/paid ratio. Spent/in-flight reversals pause further generation for manual review; no story is deleted. Never invoke external refunds from webhook handling.

Starter eligibility begins at migration application; previously registered accounts are not retroactively credited. Login checks verified status and idempotently attempts claim. HMAC-hashed Cloudflare client IP and a serialized settings row enforce max 3 grants/IP/UTC day and 100 total grants/UTC day. IP hashes, not raw IPs, are stored. Shared networks may hit the cap and need support. These are bounded safeguards, not a guarantee against determined abuse. There is no browser fingerprint or tracking cookie added.

## Release gates
1. Run web unit tests/typecheck/build and credit-lot PGlite tests.
2. Run existing PostgreSQL concurrency suite then creem-postgres-concurrency.mjs in a disposable loopback PostgreSQL 17 service only.
3. Review/account for active jobs. Apply migration 006 transactionally, verify source/ACL/invariants, compare story/node and available/reserved balances; never reseed accounts.
4. Deploy exact tested frontend commit. Keep generation Worker unchanged.
5. Verify unauthenticated endpoints reject access; invalid webhook signatures reject; own-account balances/private list work and old identities cannot access each other.
6. Configure missing webhook event only after endpoint is verified. Live charge/renewal remains untested unless separately performed by the owner. Do not claim end-to-end paid fulfillment solely from synthetic tests.

Official contracts checked: https://docs.creem.io/code/webhooks ; https://docs.creem.io/api-reference/endpoint/create-checkout ; https://docs.creem.io/api-reference/endpoint/create-customer-billing ; https://www.creem.io/buyer-terms .
