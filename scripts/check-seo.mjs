// Check the actual HTML response seen by a crawler, without JavaScript execution.
// Usage: node scripts/check-seo.mjs http://localhost:3102
// Node 24: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=... node scripts/check-seo.mjs https://inkquest.dev
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = new URL(process.argv[2] || "http://localhost:3102");
const canonicalOrigin = "https://inkquest.dev";
const newStories = ["the-borrowed-sect-1", "the-seven-oclock-lost-and-found", "the-moon-greenhouse", "before-the-rain-stops", "manager-for-a-day"];
const results = [];
const decode = (text) => text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key.toLowerCase(), decode(value)])));
}
function meta(html, name) {
  return tags(html, "meta").find((tag) => tag.name === name || tag.property === name)?.content;
}
function canonical(html) {
  const links = tags(html, "link").filter((tag) => tag.rel === "canonical");
  assert.equal(links.length, 1, "Exactly one canonical is required");
  return new URL(links[0].href).href;
}
function visibleText(html) {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "")).replace(/\s+/g, "");
}
async function get(path, redirect = "follow") {
  return fetch(new URL(path, base), {
    redirect,
    headers: { "User-Agent": "Googlebot" },
    signal: AbortSignal.timeout(30000),
  });
}
async function check(label, run) {
  try {
    const details = await run();
    results.push({ label, ok: true, ...details });
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push({ label, ok: false, error: error.message });
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

const sitemapResponse = await get("/sitemap.xml");
assert.equal(sitemapResponse.status, 200, "sitemap.xml must return HTTP 200");
assert.match(sitemapResponse.headers.get("content-type") || "", /xml/);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => decode(url));
assert.ok(urls.length > 0, "Sitemap is empty");
assert.equal(new Set(urls).size, urls.length, "Duplicate URLs in sitemap");
for (const id of newStories) assert.ok(urls.includes(`${canonicalOrigin}/stories/${id}`), `Missing new story ${id}`);
for (const path of ["/generate", "/subscribe", "/login", "/saved-words", "/stories/master-secret", "/stories/last-train"]) {
  assert.ok(!urls.includes(`${canonicalOrigin}${path}`), `${path} must not be in sitemap`);
}

const titles = new Set();
const descriptions = new Set();
for (const url of urls) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, canonicalOrigin);
  const path = parsed.pathname + parsed.search;
  await check(path, async () => {
    const response = await get(path, "manual");
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(canonical(html), parsed.href);
    assert.doesNotMatch(meta(html, "robots") || "", /noindex/);
    assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/);
    const matches = [...html.matchAll(/<title>(.*?)<\/title>/g)];
    assert.equal(matches.length, 1, "Exactly one title is required");
    const title = decode(matches[0][1]);
    assert.ok(!titles.has(title), `Duplicate title: ${title}`);
    titles.add(title);
    const description = meta(html, "description");
    assert.ok(description?.length > 30, "Missing useful description");
    assert.ok(!descriptions.has(description), "Duplicate description");
    descriptions.add(description);
    if (!parsed.pathname.startsWith("/stories/")) {
      assert.equal((html.match(/<h1\b/g) || []).length, 1, "Exactly one visible page heading is required");
    }
    if (path === "/") assert.equal(meta(html, "google-site-verification"), "hclfm0c0RpipJiZCJGS3Eu72ZP418xo-rpMk2b-Rrxk");

    if (parsed.pathname.startsWith("/stories/")) {
      assert.equal(meta(html, "og:url"), url);
      assert.equal(meta(html, "og:description"), description);
      assert.equal(meta(html, "twitter:description"), description);
      const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(([, json]) => JSON.parse(json));
      const graph = blocks.flatMap((block) => block["@graph"] || [block]);
      const work = graph.find((item) => item["@type"] === "CreativeWork");
      assert.ok(work, "Missing story structured data");
      assert.equal(work.url, url);
      assert.equal(work.description, description);
      assert.ok(!graph.some((item) => item["@type"] === "BreadcrumbList"), "No breadcrumb schema requested");
      assert.doesNotMatch(html, /aria-label="Breadcrumb"/);
      assert.ok(!visibleText(html).includes(description.replace(/\s+/g, "")), "SEO synopsis must not add visible reader content");
      const id = parsed.pathname.split("/").at(-1);
      if (newStories.includes(id)) {
        const story = JSON.parse(readFileSync(new URL(`../src/data/stories/zh/${id}.json`, import.meta.url), "utf8"));
        const opening = story.nodes.start.text_segments.map((segment) => segment.word).join("").slice(0, 70);
        assert.ok(visibleText(html).includes(opening.replace(/\s+/g, "")), "Opening scene missing from server HTML");
        assert.equal(work.isAccessibleForFree, true);
      }
      if (id === "the-borrowed-sect-1") {
        assert.doesNotMatch(visibleText(html), /Onlypart1isavailable/);
        assert.ok(work.isPartOf);
        assert.doesNotMatch(html, /href="\/stories\/the-borrowed-sect-[23]"/, "Unpublished sequels must not be linked");
      }
    }
    return { status: response.status, title, description, canonical: canonical(html) };
  });
}

for (const [path, expectedCanonical, noindex] of [
  ["/stories?target=zh", "/stories", false],
  ["/stories?level=HSK%204", "/stories", true],
  ["/stories?target=en&level=B1", "/stories?target=en", true],
  ["/stories/the-borrowed-sect-1?utm_source=seo-check", "/stories/the-borrowed-sect-1", false],
]) {
  await check(path, async () => {
    const response = await get(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(canonical(html), new URL(expectedCanonical, canonicalOrigin).href);
    assert.equal((meta(html, "robots") || "").includes("noindex"), noindex);
  });
}
for (const path of ["/generate", "/subscribe", "/login", "/saved-words"]) {
  await check(`${path} excluded`, async () => {
    const response = await get(path, "manual");
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.ok([200, 307, 308].includes(response.status));
    if (response.status === 200) assert.match(meta(await response.text(), "robots") || "", /noindex/);
  });
}
for (const id of ["master-secret", "last-train"]) {
  await check(`${id} archived`, async () => {
    const response = await get(`/stories/${id}`);
    assert.equal(response.status, 200);
    assert.match(meta(await response.text(), "robots") || "", /noindex/);
  });
}
await check("missing story returns 404", async () => assert.equal((await get("/stories/seo-missing-story")).status, 404));
await check("robots permits reading noindex pages", async () => {
  const response = await get("/robots.txt");
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /Sitemap: https:\/\/inkquest.dev\/sitemap.xml/);
  assert.doesNotMatch(text, /Disallow: \/(?:generate|subscribe|login|saved-words)/);
});
mkdirSync("output/seo", { recursive: true });
writeFileSync("output/seo/check.json", JSON.stringify({ base: base.href, checkedAt: new Date().toISOString(), sitemapUrls: urls.length, results }, null, 2));
console.log(`${results.filter((result) => result.ok).length}/${results.length} checks passed`);
if (results.some((result) => !result.ok)) process.exitCode = 1;
