# InkQuest

Interactive language-learning fiction built with Next.js, Supabase, and OpenNext Cloudflare.

## Getting Started

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Generated Stories Foundation

The first cloud-generation foundation includes:

- Supabase credit ledger, reservations, story graph, jobs, outbox, billing tables, and RLS in `supabase/migrations/202608220001_generated_story_billing.sql`.
- Server-created Lemon Squeezy checkouts and idempotent webhook processing.
- Authenticated quote and generated-story job creation APIs.
- Cloud adapter contracts and a reusable scene enrichment core in `tools/story-pipeline/src/core`.

Required server environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_GOOGLE_CLIENT_ID
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL

LEMONSQUEEZY_API_KEY
LEMONSQUEEZY_STORE_ID
LEMONSQUEEZY_WEBHOOK_SECRET
LEMONSQUEEZY_SUBSCRIPTION_VARIANT_ID
LEMONSQUEEZY_SUBSCRIPTION_CREDIT_GRANT
LEMONSQUEEZY_CREDIT_PACK_VARIANT_ID
LEMONSQUEEZY_CREDIT_PACK_GRANT

GENERATION_PRICING_VERSION
GENERATION_OPENING_TEXT_CREDITS
GENERATION_OPENING_TTS_CREDITS
GENERATION_SCENE_TEXT_CREDITS
GENERATION_SCENE_TTS_CREDITS
```

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is the Web OAuth client ID from Google Cloud. Add each deployed site origin (including local development) to its authorized JavaScript origins, and enable Google provider in Supabase.

Credit-pack variables are optional until that product is enabled. Generation pricing falls back to 20 credits for opening text, 10 for opening TTS, 12 for scene text, and 6 for scene TTS when the corresponding environment variables are missing or invalid. TTS pricing is required only when `every_scene` is offered. Never expose the service-role key, Lemon API key, or webhook secret through a `NEXT_PUBLIC_` variable.

Apply the migrations in filename order. Existing environments that already ran the first two migrations should next apply `supabase/migrations/202608230001_generated_story_tts.sql`; it creates the private audio bucket and adds independent TTS commit/retry/refund transactions.

The generation execution path is:

```text
Next.js → inkquest-generation Queue → generation-dispatcher → Cloud Run story-pipeline Worker
```

Additional main-app variables:

```text
GENERATION_DISPATCH_SECRET
GENERATED_AUDIO_BUCKET
```

Cloud Run Worker variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GENERATION_WORKER_TOKEN
LLM_CHAT_COMPLETIONS_URL
LLM_API_KEY
LLM_MODEL
LLM_PROMPT_VERSION
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
TENCENT_REGION
TENCENT_TTS_VOICE
GENERATED_AUDIO_BUCKET
```

`GENERATED_AUDIO_BUCKET` defaults to `generated-audio`. The Worker image installs FFmpeg so multi-part Tencent audio is normalized into one seekable MP3 before upload. English currently uses Tencent's English voice as the MVP fallback when those credentials are configured.

Create `inkquest-generation` and `inkquest-generation-dlq` in Cloudflare, deploy the main app, then deploy `tools/generation-dispatcher/wrangler.jsonc`. Configure `GENERATION_WORKER_URL` on the dispatcher and store `GENERATION_WORKER_TOKEN` with `wrangler secret put`.

For local development, start the Worker in a separate terminal before generating a story:

```bash
PORT=8080 pnpm --filter @inkquest/story-pipeline worker:start
```

The Next.js development server dispatches new jobs to `http://127.0.0.1:8080` by default. Set `GENERATION_WORKER_URL` to override it, and make sure Next.js and the Worker use the same `GENERATION_WORKER_TOKEN`.

Call `POST /api/internal/generation/outbox` every minute with `Authorization: Bearer <GENERATION_DISPATCH_SECRET>` to recover failed queue publications and expired Worker leases.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm --filter @inkquest/story-pipeline typecheck
pnpm lint
pnpm build
```

Deployment uses OpenNext Cloudflare; see `wrangler.jsonc` and the `preview` / `deploy` scripts in `package.json`.
