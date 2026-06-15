/**
 * enrich-draft: 把 agent 写的草稿（drafts/<id>.draft.json）富化成中间产物
 * （build/<id>.enriched.json）。机械字段全部填好，meaning 预填默认值供 agent 审校。
 *
 * 用法：
 *   tsx src/cli/enrich-draft.ts <draftPath> [outPath]
 *   pnpm --filter @inkquest/story-pipeline exec tsx src/cli/enrich-draft.ts drafts/foo.draft.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { getEnricher } from "../enrich/index.js";
import { decideTier, defaultMeaning } from "../tier.js";
import type { StoryDraft, EnrichedStory, EnrichedNode, EnrichedTokenItem } from "../types-draft.js";

function main() {
  const draftPath = process.argv[2];
  if (!draftPath) {
    console.error("用法: tsx src/cli/enrich-draft.ts <draftPath> [outPath]");
    process.exit(1);
  }
  const draft: StoryDraft = JSON.parse(readFileSync(draftPath, "utf8"));
  const enricher = getEnricher(draft.target_lang);

  const nodes: Record<string, EnrichedNode> = {};
  for (const [id, node] of Object.entries(draft.nodes)) {
    const plot = new Set(node.plotWords ?? []);
    const tokens: EnrichedTokenItem[] = enricher.enrich(node.text).map((tk) => {
      let tier = decideTier(tk, draft.target_lang);
      const isPlot = plot.has(tk.word);
      if (isPlot) tier = "key"; // 剧情词强制 key
      const meaning = tier === "base" ? null : defaultMeaning(tk.candidates, draft.gloss_lang);
      const item: EnrichedTokenItem = {
        word: tk.word,
        reading: tier === "base" ? null : tk.reading,
        level: tier === "base" ? null : tk.level,
        tier,
        candidates: tk.candidates,
        meaning,
      };
      if (isPlot) item.isPlotKeyword = true;
      return item;
    });
    nodes[id] = { choices: node.choices, tokens };
  }

  const enriched: EnrichedStory = {
    story_id: draft.story_id,
    target_lang: draft.target_lang,
    gloss_lang: draft.gloss_lang,
    title_cn: draft.title_cn,
    title_en: draft.title_en,
    level: draft.level,
    level_system: draft.level_system,
    nodes,
  };

  const outPath = process.argv[3] ??
    join(dirname(draftPath), "..", "build", basename(draftPath).replace(/\.draft\.json$/, ".enriched.json"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(enriched, null, 2) + "\n");

  // 统计缺释义的非 base 词，提示 agent 重点审校
  let missing = 0, total = 0;
  for (const n of Object.values(nodes)) for (const t of n.tokens) {
    if (t.tier !== "base") { total++; if (!t.meaning) missing++; }
  }
  console.log(`✓ 富化完成 → ${outPath}`);
  console.log(`  生词 ${total} 个，其中 ${missing} 个无词典释义（需 agent 补 meaning）`);
  console.log(`  下一步：agent 审校 meaning（按上下文从 candidates 选/改写），然后跑 assemble-story.ts`);
}

main();
