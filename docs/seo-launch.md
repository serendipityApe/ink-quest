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

Cloudflare/OpenNext packaging also passed after generating the standalone Next.js output required by the adapter. The SEO release was pushed as `7dcc225982deaf1f39c0a58e370be162d085dab0` and deployed successfully by [GitHub Actions](https://github.com/serendipityApe/ink-quest/actions/runs/36401415004). Production HTTP checks also passed **29/29** after deployment.

Generated `output/` source copies are excluded from TypeScript checking. The release includes only SEO changes; the workspace's Paddle migration, funnel instrumentation and library redesign remain outside this commit. The staged release was also built independently from those changes.

Run against a running production server:

```sh
pnpm exec next start --port 3102
pnpm check:seo http://localhost:3102
```

The HTTP suite passed **29/29** checks over **17 sitemap URLs**, metadata uniqueness, canonicals, noindex responses, missing/archived stories, JSON-LD, the Google verification tag, and the five new stories' opening text without executing client JavaScript. Results are in `output/seo/check.json`.

The five new story covers returned HTTP 200 at the configured production asset location. The SEO suite also checks that the synopsis and series availability notice do not add visible reader content, and that no breadcrumb schema is emitted.

ESLint passed for the new SEO files and changed metadata/catalog/library/config files. The reader still has two pre-existing `react-hooks/set-state-in-effect` findings in its initialization and node-fetch effects; other lint rules on that file passed. These unrelated effects were not rewritten for SEO.

## Search Console: ownership verified and sitemap processed (2026-09-28)

The URL-prefix resource `https://inkquest.dev/` was verified using the homepage HTML meta tag. Search Console explicitly displayed “已完成所有权验证”. Keep the tag permanently. This token is public website markup, not an API credential.

`https://inkquest.dev/sitemap.xml` was submitted successfully. Search Console showed **成功**, **17 discovered pages**, and a last-read date of **2026-09-28**. This confirms sitemap processing, not indexing of all 17 pages.

The homepage URL Inspection was initiated in the existing Chrome tab, but no completed inspection result or live test was confirmed. Browser interaction was paused because the user was concurrently switching tabs; it should resume when the GSC tab can stay available. No indexing request was confirmed.

Remaining Google-side validation:

1. Inspect `/`, `/stories`, `/stories/the-borrowed-sect-1`, and `/stories/before-the-rain-stops`.
2. Record each indexed state and run its live test. Confirm crawl/index permission and declared canonical; Google's selected canonical may be unavailable before indexing.
3. Request indexing after successful live tests. Record a request as a request, not successful indexing.

Production HTTP/SSR validation is complete, but it is not a substitute for these Google-side results. Local evidence is stored in `output/seo/check.json` and `output/seo/gsc-results.json`.

References: [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [requesting recrawls](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).
