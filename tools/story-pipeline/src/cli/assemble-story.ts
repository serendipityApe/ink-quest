/**
 * assemble-story: 把 agent 审校后的 enriched 中间产物组装成最终 StoryJSON，
 * 生成 timestamps（优先真实 TTS 词级对齐，无 TTS 配置时降级估时），校验，
 * 写入 src/data/stories/<target>/<id>.json；TTS 音频写入 public/audio/。
 *
 * 用法：
 *   tsx src/cli/assemble-story.ts <enrichedPath> [--write] [--no-audio]
 *   不带 --write 为 dry-run：只校验并打印，不落盘。
 *   --no-audio 跳过 TTS，强制估时（即使配了密钥）。
 */
import "../env.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnrichedStory } from "../types-draft.js";
import type { StoryJSON, StoryNodeJSON, TextSegment, Timestamp } from "../schema.js";
import { estimateTimestamps } from "../timing.js";
import { validateStory } from "../validate.js";
import { getTtsProvider } from "../tts/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// tools/story-pipeline/src/cli → 仓库根
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

async function main() {
  const enrichedPath = process.argv[2];
  const write = process.argv.includes("--write");
  const noAudio = process.argv.includes("--no-audio");
  if (!enrichedPath) {
    console.error("用法: tsx src/cli/assemble-story.ts <enrichedPath> [--write] [--no-audio]");
    process.exit(1);
  }
  const e: EnrichedStory = JSON.parse(readFileSync(enrichedPath, "utf8"));

  // TTS：配置了密钥且未 --no-audio 时启用，否则降级估时
  const tts = noAudio ? null : getTtsProvider(e.target_lang);
  const audioDir = join(REPO_ROOT, "public", "audio");
  if (tts && write) mkdirSync(audioDir, { recursive: true });
  if (tts) console.log(`🔊 TTS: ${tts.name}（真实音频 + 词级时间戳）`);
  else console.log(`🔇 无 TTS（${noAudio ? "--no-audio" : "未配置密钥"}）→ 降级估时，不产音频`);

  const nodes: Record<string, StoryNodeJSON> = {};
  for (const [id, node] of Object.entries(e.nodes)) {
    const segments: TextSegment[] = node.tokens.map((t) => {
      const seg: TextSegment = {
        word: t.word,
        reading: t.reading,
        meaning: t.meaning,
        level: t.level,
        tier: t.tier,
      };
      if (t.isPlotKeyword) seg.isPlotKeyword = true;
      return seg;
    });

    let timestamps: Timestamp[];
    let audioUrl: string | null = null;

    if (tts) {
      const words = segments.map((s) => s.word);
      const { audio, timings } = await tts.synthesize(words);
      timestamps = timings;
      const rel = `/audio/${e.story_id}-${id}.mp3`;
      audioUrl = rel;
      if (write) {
        writeFileSync(join(audioDir, `${e.story_id}-${id}.mp3`), audio);
      }
      console.log(`  ♪ ${id}: ${words.length} 词 → ${(audio.length / 1024).toFixed(0)}KB mp3`);
    } else {
      timestamps = estimateTimestamps(segments, e.target_lang);
    }

    nodes[id] = {
      bg_image: null,
      audio_url: audioUrl,
      text_segments: segments,
      timestamps,
      choices: node.choices,
    };
  }

  const story: StoryJSON = {
    story_id: e.story_id,
    target_lang: e.target_lang,
    gloss_lang: e.gloss_lang,
    title_cn: e.title_cn,
    title_en: e.title_en,
    level: e.level,
    level_system: e.level_system,
    nodes,
  };

  const result = validateStory(story);
  for (const w of result.warnings) console.warn(`⚠ ${w}`);
  if (!result.ok) {
    console.error("✗ 校验失败：");
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`✓ 校验通过：${result.stats.nodes} 节点，${result.stats.endings} 结局，全部可达`);

  if (!write) {
    console.log("（dry-run，未写盘。加 --write 落地）");
    return;
  }

  const outPath = join(REPO_ROOT, "src", "data", "stories", e.target_lang, `${e.story_id}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(story, null, 2) + "\n");
  console.log(`✓ 写出 ${outPath}`);
  if (tts) console.log(`✓ 音频写入 ${audioDir}/${e.story_id}-*.mp3`);
  console.log(`→ 手动登记：src/lib/stories/registry.ts 的 LOADERS + CATALOG；src/data/storyMaps.ts 节点短标题`);
}

main().catch((err) => {
  console.error("✗ 出错:", err.message);
  process.exit(1);
});
