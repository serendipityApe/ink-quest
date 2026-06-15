export type HighlightTier = "base" | "normal" | "key";

/** 学习的目标语言（也就是故事正文所用的语言）。 */
export type TargetLang = "zh" | "en";

/** 释义/界面等使用的语言。当前与 TargetLang 同集合，但语义不同。 */
export type Lang = "zh" | "en";

/**
 * 分级体系：中文用 HSK，英文用 CEFR。level 字段统一为字符串，
 * 由 level_system 标明它属于哪套体系，UI 据此渲染标签/筛选项。
 */
export type LevelSystem = "HSK" | "CEFR";

export type HskLevel =
  | "HSK 1" | "HSK 2" | "HSK 3"
  | "HSK 4" | "HSK 5" | "HSK 6"
  | "HSK 7" | "HSK 8" | "HSK 9";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** 词/句的分级标签。具体取值取决于故事的 level_system。 */
export type LevelLabel = HskLevel | CefrLevel;

export interface TextSegment {
  word: string;
  /** 读音辅助：中文为拼音，英文可为 IPA 或留空。标点/无需注音时为 null。 */
  reading: string | null;
  /** 释义，语言由所属故事的 gloss_lang 决定（如中文母语者学英文 → 中文释义）。 */
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
  /** 学习的目标语言；正文/音频/时间戳都是这门语言。 */
  target_lang: TargetLang;
  /** 释义所用语言（面向哪种母语的学习者）。 */
  gloss_lang: Lang;
  title_cn: string;
  title_en: string;
  level: LevelLabel;
  level_system: LevelSystem;
  nodes: Record<string, StoryNodeJSON>;
}

/**
 * 清单（manifest）：故事的轻量图结构，剥离了 text_segments / timestamps（体积大头）。
 * 供路径图渲染、选项按钮、进度分母使用，可公开缓存。约 1~2 KB。
 */
export interface ManifestNode {
  choices: StoryChoice[];
  /** 该节点是否为付费内容（被某个 premium 选项指向）。前端据此提示，服务端据此鉴权。 */
  premium: boolean;
}

export interface StoryManifest {
  story_id: string;
  target_lang: TargetLang;
  gloss_lang: Lang;
  title_cn: string;
  title_en: string;
  level: LevelLabel;
  level_system: LevelSystem;
  start_node_id: string;
  node_count: number;
  nodes: Record<string, ManifestNode>;
}

/** 单节点内容端点的返回：一个节点的完整可渲染数据。 */
export interface StoryNodeResponse {
  node_id: string;
  bg_image: string | null;
  audio_url: string | null;
  text_segments: TextSegment[];
  timestamps: Timestamp[];
  choices: StoryChoice[];
}

/** 列表页/首页卡片所需的故事摘要（由清单+卡片元数据合成）。 */
export interface StoryCard {
  id: string;
  target_lang: TargetLang;
  title_cn: string;
  title_en: string;
  level: LevelLabel;
  level_system: LevelSystem;
  genre: string;
  locked: boolean;
  image: string;
}
