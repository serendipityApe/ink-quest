import type {
  TargetLang, Lang, LevelLabel, LevelSystem,
  HighlightTier, StoryChoice,
} from "./schema.js";

/**
 * 草稿（draft）：agent（充当 LLM）创作的产物。只含剧情骨架，不含任何机械字段。
 * 由 agent 直接写到 drafts/<id>.draft.json。
 */
export interface DraftNode {
  /** 纯正文，目标语；不分词 */
  text: string;
  /** 剧情关键词（词面列表）；富化时强制 tier=key + isPlotKeyword */
  plotWords?: string[];
  choices: StoryChoice[];
}

export interface StoryDraft {
  story_id: string;
  target_lang: TargetLang;
  gloss_lang: Lang;
  title_cn: string;
  title_en: string;
  level: LevelLabel;
  level_system: LevelSystem;
  nodes: Record<string, DraftNode>;
}

/**
 * 富化中间产物（enriched）：enrich-draft 命令的输出，也是 assemble 的输入。
 * 机械字段全部由工具填好；agent 只需审校/修改每个 token 的 meaning。
 */
export interface EnrichedTokenItem {
  word: string;
  reading: string | null;
  level: LevelLabel | null;
  tier: HighlightTier;
  isPlotKeyword?: boolean;
  /** 词典候选池（仅供 agent 参考，assemble 时丢弃） */
  candidates: string[];
  /** 最终释义；enrich 预填默认值（候选首项清洗），agent 可改。base 词为 null */
  meaning: string | null;
}

export interface EnrichedNode {
  choices: StoryChoice[];
  tokens: EnrichedTokenItem[];
}

export interface EnrichedStory {
  story_id: string;
  target_lang: TargetLang;
  gloss_lang: Lang;
  title_cn: string;
  title_en: string;
  level: LevelLabel;
  level_system: LevelSystem;
  nodes: Record<string, EnrichedNode>;
}
