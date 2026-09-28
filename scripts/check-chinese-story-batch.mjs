// Run with: pnpm --filter @inkquest/story-pipeline exec tsx ../../scripts/check-chinese-story-batch.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { validateStory } from "../tools/story-pipeline/src/validate.ts";
import { STORY_MAP_LABELS } from "../src/data/storyMaps.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const specs = [
  ["the-borrowed-sect-1", 24, 18, 3000, 4000, 2],
  ["the-seven-oclock-lost-and-found", 20, 12, 1500, 2200, 3],
  ["the-moon-greenhouse", 20, 12, 1500, 2200, 3],
  ["before-the-rain-stops", 20, 12, 1500, 2200, 3],
  ["manager-for-a-day", 20, 12, 1500, 2200, 3],
];
const registry = readFileSync(join(root, "src/lib/stories/registry.ts"), "utf8");
const results = [];
const hanCount = (text) => (text.match(/\p{Script=Han}/gu) ?? []).length;

for (const [id, nodeCount, pathLength, minChars, maxChars, endingCount] of specs) {
  const story = JSON.parse(readFileSync(join(root, `src/data/stories/zh/${id}.json`), "utf8"));
  const check = validateStory(story);
  assert.equal(check.ok, true, `${id}: ${check.errors.join("; ")}`);
  assert.equal(story.story_id, id);
  assert.equal(story.target_lang, "zh");
  assert.equal(story.gloss_lang, "en");
  assert.equal(check.stats.nodes, nodeCount);
  assert.equal(check.stats.endings, endingCount);
  assert(story.nodes.start, `${id}: missing start`);
  assert(registry.includes(`"@/data/stories/zh/${id}.json"`), `${id}: missing loader`);
  assert(registry.includes(`id: "${id}"`), `${id}: missing card`);
  assert.deepEqual(Object.keys(STORY_MAP_LABELS[id] ?? {}).sort(), Object.keys(story.nodes).sort(), `${id}: map labels must cover exactly the story nodes`);
  const cover = registry.match(new RegExp(`id: "${id}",[\\s\\S]*?image: "([^"]+)"`))?.[1];
  assert(cover?.startsWith("/covers/"), `${id}: missing local cover reference`);
  assert(existsSync(join(root, "public", cover)), `${id}: missing cover ${cover}`);

  const paths = [];
  const counts = {};
  const durations = {};
  let audioBytes = 0;
  let totalWords = 0;
  let unknownLevelWords = 0;
  let aboveTargetWords = 0;
  let knownLevelWords = 0;
  const targetLevel = Number(story.level.replace(/\D/g, ""));
  const suspectGlosses = [];

  for (const [nodeId, node] of Object.entries(story.nodes)) {
    assert(node.choices.length > 0, `${id}/${nodeId}: no onward choice`);
    assert(node.choices.every((c) => !c.premium), `${id}/${nodeId}: paywall`);
    const text = node.text_segments.map((t) => t.word).join("");
    counts[nodeId] = hanCount(text);
    assert(counts[nodeId] > 100, `${id}/${nodeId}: thin scene`);
    assert(node.audio_url?.startsWith(`/audio/${id}-`), `${id}/${nodeId}: missing batch audio`);
    const audioPath = join(root, "public", node.audio_url);
    assert(existsSync(audioPath), `${id}/${nodeId}: missing audio file`);
    const bytes = statSync(audioPath).size;
    assert(bytes > 1000, `${id}/${nodeId}: empty audio`);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath], { encoding: "utf8" }).trim());
    assert(Number.isFinite(duration) && duration > 0, `${id}/${nodeId}: invalid audio`);
    assert(node.timestamps.at(-1).end <= duration * 1000 + 100, `${id}/${nodeId}: timestamps outlast audio`);
    audioBytes += bytes;
    durations[nodeId] = duration;
    for (const token of node.text_segments) {
      if (!hanCount(token.word)) continue;
      totalWords++;
      if (token.tier !== "base") {
        assert(token.reading, `${id}/${nodeId}: missing pinyin for ${token.word}`);
        assert(token.meaning?.trim(), `${id}/${nodeId}: missing gloss for ${token.word}`);
        if (/surname|old testament|al[- ]qaeda|variant of|see also|^CL:|^Taiwan pr\./i.test(token.meaning)) {
          suspectGlosses.push({ node: nodeId, word: token.word, meaning: token.meaning });
        }
      }
      if (token.level) {
        knownLevelWords++;
        if (Number(token.level.replace(/\D/g, "")) > targetLevel) aboveTargetWords++;
      } else if (token.tier !== "base") unknownLevelWords++;
    }
  }

  const walk = (nodeId, path = []) => {
    assert(!path.includes(nodeId), `${id}: cycle at ${nodeId}`);
    const nextPath = [...path, nodeId];
    for (const c of story.nodes[nodeId].choices) {
      if (c.next_node_id === "end_back_to_list") paths.push(nextPath);
      else walk(c.next_node_id, nextPath);
    }
  };
  walk("start");
  for (const path of paths) {
    assert.equal(path.length, pathLength, `${id}: wrong route depth`);
    const chars = path.reduce((n, key) => n + counts[key], 0);
    assert(chars >= minChars && chars <= maxChars, `${id}: path has ${chars} characters`);
  }
  const pathChars = paths.map((p) => p.reduce((n, key) => n + counts[key], 0));
  const pathSeconds = paths.map((p) => p.reduce((n, key) => n + durations[key], 0));
  const result = {
    id, title: story.title_cn, level: story.level, nodes: nodeCount, endings: endingCount,
    routes: paths.length, nodesPerRoute: pathLength,
    totalHanCharacters: Object.values(counts).reduce((a, b) => a + b, 0),
    routeHanCharacters: [Math.min(...pathChars), Math.max(...pathChars)],
    routeAudioMinutes: [Math.min(...pathSeconds), Math.max(...pathSeconds)].map((s) => Math.round(s / 6) / 10),
    audioFiles: nodeCount, audioBytes, totalWords, knownLevelWords, aboveTargetWords, unknownLevelWords,
    suspectGlosses, schemaWarnings: check.warnings.length,
  };
  results.push(result);
  console.log(JSON.stringify(result));
}

const output = join(root, "output/story-batch");
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "verification.json"), JSON.stringify(results, null, 2) + "\n");
console.log(`PASS: ${results.length} stories, ${results.reduce((n, s) => n + s.nodes, 0)} nodes, all complete routes checked.`);
