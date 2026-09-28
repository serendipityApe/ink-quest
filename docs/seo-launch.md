# InkQuest SEO rollout

## Implemented

- Each catalog story has an editorial English/Chinese synopsis. `StoryCard` requires both, so new stories cannot silently omit them.
- Story metadata uses the story's English name, target language and level, an independent description, a self-referencing canonical, and Open Graph/Twitter fields. SVG covers are not used as social-card images.
- Reading and library pages retain their existing presentation. SEO does not insert a visible introduction, synopsis, breadcrumbs or series section. Opening story text remains server-rendered, and Chinese story text has `lang="zh-Hans"`.
- The Borrowed Sect has series metadata without adding visible links to unpublished parts.
- Invisible CreativeWork JSON-LD describes the story, genre, level and series. No breadcrumb schema is emitted. This does not claim eligibility for a special Google rich result.
- The root layout no longer gives all routes a homepage canonical. The homepage owns its own canonical and Google verification tag.
- Chinese `/stories` and English `/stories?target=en` have separate titles and canonicals. Level filters are `noindex, follow` and canonicalize to the corresponding full library. Tracking parameters do not change story canonicals.
- Sitemap contains the homepage, both libraries, legal pages and the 11 published stories, including the five new Chinese stories. Withdrawn demos and locked cards are excluded.
- `/generate`, `/subscribe`, `/login` and `/saved-words` have `noindex, follow` in metadata and an `X-Robots-Tag` header. These URLs remain crawlable so crawlers can see the directive. This is an indexing policy; it does not disable billing or generation functionality.
- Archived demo URLs remain readable but are `noindex`. Unknown story URLs return 404.

## Local validation (2026-09-28)

Production Next.js build and TypeScript check passed using webpack. The initial default build could not download Google Fonts because the shell did not use the system's HTTP proxy; using the configured proxy resolved font access.

Cloudflare/OpenNext packaging also passed after generating the standalone Next.js output required by the adapter. The prepared worker is `.open-next/worker.js`; it has not been deployed.

Generated `output/` source copies are excluded from TypeScript checking. The release includes only SEO changes; the workspace's Paddle migration, funnel instrumentation and library redesign remain outside this commit. The staged release was also built independently from those changes.

Run against a running production server:

```sh
pnpm exec next start --port 3102
pnpm check:seo http://localhost:3102
```

The HTTP suite passed **29/29** checks over **17 sitemap URLs**, metadata uniqueness, canonicals, noindex responses, missing/archived stories, JSON-LD, the Google verification tag, and the five new stories' opening text without executing client JavaScript. Results are in `output/seo/check.json`.

The five new story covers returned HTTP 200 at the configured production asset location. The SEO suite also checks that the synopsis and series availability notice do not add visible reader content, and that no breadcrumb schema is emitted.

ESLint passed for the new SEO files and changed metadata/catalog/library/config files. The reader still has two pre-existing `react-hooks/set-state-in-effect` findings in its initialization and node-fetch effects; other lint rules on that file passed. These unrelated effects were not rewritten for SEO.

## Search Console: prepared, pending production publication

The signed-in Google account did not have an InkQuest resource. The URL-prefix resource `https://inkquest.dev/` was added and its HTML verification token was copied into the homepage's Metadata API `verification.google` field. This token is public website markup, not an API credential.

Ownership has **not yet been verified**. Sitemap submission and Google's URL Inspection/live tests have **not yet been completed**. Local HTTP checks are not a substitute for those Google results.

Before publication, production `/sitemap.xml` returned 404. See `output/seo/production-before.json` for direct HTTP checks of the homepage, library, representative story, sitemap and robots file. The workspace also contains independent billing and other unpublished changes; production publication needs a confirmed release scope.

After publishing the intended release:

1. Run `pnpm check:seo https://inkquest.dev` (Node 24 can use the system proxy through `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY` when needed).
2. Return to the Search Console HTML-tag verification dialog for `https://inkquest.dev/`, verify, and retain the tag permanently.
3. Submit `https://inkquest.dev/sitemap.xml` in Sitemaps. Check Google's fetch status separately from the submission acknowledgement.
4. Inspect `/`, `/stories`, `/stories/the-borrowed-sect-1`, and `/stories/before-the-rain-stops`. Record the indexed state and run the live test for each. Confirm HTTP availability, crawl/index permission, visible content and declared canonical; Google's selected canonical may be unavailable before indexing.
5. Request indexing for those representative pages after successful live tests. Record a request as a request, not successful indexing.

References: [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [requesting recrawls](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).
