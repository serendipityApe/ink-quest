/**
 * 富化层演示/自检 CLI。
 * 用法：
 *   pnpm --filter @inkquest/story-pipeline enrich:demo            # 跑内置中英文样例
 *   tsx src/cli/enrich-demo.ts zh "你推开房门，只见屋内寒气森森。"
 *   tsx src/cli/enrich-demo.ts en "You pushed the door open."
 */
import { getEnricher } from "../enrich/index.js";
import type { TargetLang } from "../schema.js";

const SAMPLES: Record<TargetLang, string> = {
  zh: "你推开房门，只见屋内寒气森森，空气中弥漫着一种诡异的香气。",
  en: "You stood before the rusty gate of an abandoned mansion.",
};

function run(target: TargetLang, sentence: string) {
  const enricher = getEnricher(target);
  const tokens = enricher.enrich(sentence);
  console.log(`\n=== ${target} (gloss=${enricher.gloss}) ===`);
  console.log(`原文: ${sentence}\n`);
  for (const t of tokens) {
    const tier = t.baseGuess ? "base" : "word";
    const reading = t.reading ?? "—";
    const lvl = t.level ?? "—";
    const cand = t.candidates.length ? t.candidates.slice(0, 2).join(" / ") : "—";
    console.log(
      `  ${t.word.padEnd(10)} [${tier.padEnd(4)}] ${reading.padEnd(14)} ${String(lvl).padEnd(6)} ${cand}`
    );
  }
  // 自检：拼接还原 = 原文（分词无损）
  const joined = tokens.map((t) => t.word).join(target === "en" ? "" : "");
  console.log(`\n  拼接还原长度: ${joined.length} / 原文(trim): ${sentence.trim().length}`);
}

const [, , argTarget, ...rest] = process.argv;
if (argTarget === "zh" || argTarget === "en") {
  run(argTarget, rest.join(" ") || SAMPLES[argTarget]);
} else {
  run("zh", SAMPLES.zh);
  run("en", SAMPLES.en);
}
