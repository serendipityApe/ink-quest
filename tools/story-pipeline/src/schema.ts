/**
 * 故事 schema 类型 —— 与 web app 的 src/types/story.ts 保持一致。
 *
 * 刻意复制一份而非跨 workspace 依赖 app：
 * - pipeline 是独立工具，不应反向依赖 Next app 的源码树；
 * - schema 是稳定契约，两边各持一份、靠 validate 保证产物合规即可。
 * 若 app 侧 schema 变更，同步更新此文件（见 docs/PROJECT_OVERVIEW.md §9）。
 */

export type HighlightTier = "base" | "normal" | "key";
export type TargetLang = "zh" | "en";
export type Lang = "zh" | "en";
export type LevelSystem = "HSK" | "CEFR";

export type HskLevel =
  | "HSK 1" | "HSK 2" | "HSK 3"
  | "HSK 4" | "HSK 5" | "HSK 6"
  | "HSK 7" | "HSK 8" | "HSK 9";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LevelLabel = HskLevel | CefrLevel;

export interface TextSegment {
  word: string;
  reading: string | null;
  meaning: string | null;
  level: LevelLabel | null;
  tier: HighlightTier;
  isPlotKeyword?: boolean;
}

export interface Timestamp {
  start: number;
  end: number;
}

export interface StoryChoice {
  text: string;
  next_node_id: string;
  premium?: boolean;
}

export interface StoryNodeJSON {
  bg_image: string | null;
  audio_url: string | null;
  text_segments: TextSegment[];
  timestamps: Timestamp[];
  choices: StoryChoice[];
}

export interface StoryJSON {
  story_id: string;
  target_lang: TargetLang;
  gloss_lang: Lang;
  title_cn: string;
  title_en: string;
  level: LevelLabel;
  level_system: LevelSystem;
  nodes: Record<string, StoryNodeJSON>;
}
