import type {
  StoryJSON,
  StoryManifest,
  ManifestNode,
  StoryNodeResponse,
  StoryCard,
  TargetLang,
} from "@/types/story";

/**
 * 服务端故事注册表（单一数据源）。
 *
 * 仅供 src/app/api/ 下的路由处理器 import —— 切勿在客户端组件引用，
 * 否则故事正文会被打进客户端 bundle，付费内容也会随之泄漏。
 *
 * 故事按「学习目标语言」分目录存放：src/data/stories/<target>/<id>.json。
 * 学中文与学英文是两套完全独立的故事（正文/音频/时间戳各不相同）。
 * 新增故事：① 在 CATALOG 登记卡片元数据；② 在 LOADERS 登记数据加载器。
 */

/** 故事正文加载器（按 story_id 索引；id 全局唯一）。 */
const LOADERS: Record<string, () => Promise<StoryJSON>> = {
  "master-secret": () =>
    import("@/data/stories/zh/master-secret.json").then((m) => m.default as StoryJSON),
  "last-train": () =>
    import("@/data/stories/zh/last-train.json").then((m) => m.default as StoryJSON),
  "haunted-house": () =>
    import("@/data/stories/en/haunted-house.json").then((m) => m.default as StoryJSON),
  "pipeline-smoke": () =>
    import("@/data/stories/zh/pipeline-smoke.json").then((m) => m.default as StoryJSON),
  "signal-from-the-deep": () =>
    import("@/data/stories/en/signal-from-the-deep.json").then((m) => m.default as StoryJSON),
};

/**
 * 卡片目录：列表页/首页所需的展示元数据（封面、genre、锁定态等）。
 * 与正文数据分离，列表页无需加载任何故事内容即可渲染。
 */
const CATALOG: StoryCard[] = [
  {
    id: "master-secret",
    target_lang: "zh",
    title_cn: "师尊的秘密",
    title_en: "The Secret of the Master",
    level: "HSK 4",
    level_system: "HSK",
    genre: "Xianxia",
    locked: false,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCVCmwDjWWepAYvAZcCqk_xatLu8OYqNUqHUG0Q60x2PRJ2AoTDRrrJnBGq0XoYF8SNjbM2zp6ydg-smBdAjFAWSF9YJuXW1LerMIUdwxPB2__jDs8iIu70UCFjQW7IOptszOBppgCmPOt0k2a7a5iMM2c9GSv0xzuX9Z3sCqIHvH0Y04ZsN8_6MU6JX1MaiCG05aWxbEREymYHdiHd9GVCiIrft4V9ZDo2QE9m1l5oXJ9DzNSc5XyZMYMCHTu0mO52wvh86e_8cFem",
  },
  {
    id: "last-train",
    target_lang: "zh",
    title_cn: "末班地铁",
    title_en: "The Last Train",
    level: "HSK 4",
    level_system: "HSK",
    genre: "Urban Horror",
    locked: false,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDFUoNSnoejdFuBy8VNwharovOHGD6g44r4kKn7_HVILQUTKdbPU48FpekULUMbqrfICHZzk8drJXQlfE7Zmpo2MtjCbaX5wf0AQSDK-XnGV6cfYHSHhlC-3-tSFt-DIcN8vRiPW9SWieyCFiFbFGKKOQl7CjTuUyaYpyKtK0f4zj9gjjXmT6xaztpmGo4yS8sw3HgMexbrkiYBJ2MIVz2X4ykjjgZDEUQSaPMAS49Mble2l-P2mxVaDZr90UrV_jiSw7k_emBDjkZ6",
  },
  {
    id: "haunted-house",
    target_lang: "en",
    title_cn: "鬼屋一夜",
    title_en: "One Night in the Haunted House",
    level: "B1",
    level_system: "CEFR",
    genre: "Horror",
    locked: false,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuByAGR3eAj-islCdaxw-6Hx-2vtqhn3nBZaza3MPUZbedeFnRCjiBZQwwW1Do80PwO5P_o9YyRRQZj6dCsJo6h-CsEcWBw9ZaNKjbEEpya6Aex_415Kqo5VEc60vfrnewFcp97JiesxmS_0a3ou8G3tky6bFtJTTLTv7N5R1lhm6FIpiyJG-rh-kxa7B4Dxv5Ws6OnwY2NyIvCljmxprVpclM6CJH2SW_AiEw2tzcx_pYB45qVstjmN_XtnKebSsTuVVtvY9DIhfZhu",
  },
  {
    id: "signal-from-the-deep",
    target_lang: "en",
    title_cn: "深海信号",
    title_en: "Signal from the Deep",
    level: "B1",
    level_system: "CEFR",
    genre: "Sci-Fi/Thriller",
    locked: false,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAY23k1btIgdPesyxntFo5G0KN7A7e0i_9IafFx_v-faXzCF0oZ6yJyVxFjZUEh_oRShEWZShJFNoMHdFjJMZlx6tzFr5e0PTd7vlOXLb_9j1FqiaMREgIR7s2R1U_JteAs2f3iY7Drcl7s9lI2pEfcVP0I1b9WDwBFSSWBl-5N3P-1Qi6RkHC9bnruOAtUf3UU-mKI4NqhK8jZq12O3Ju41iokvF9YY1VuOp3I5FMdOO85n6WCEor-x_Qxb_i9K65UiGtqdsw16yR8",
  },
  // —— legacy 格式（lost-letter，正文+translations，阅读页走 legacy 分支）——
  {
    id: "lost-letter",
    target_lang: "zh",
    title_cn: "遗失的信",
    title_en: "The Lost Letter",
    level: "HSK 3",
    level_system: "HSK",
    genre: "Literature",
    locked: false,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAK9k_fl1ecLnHSrkzgIHZJRoM4FKQnbX7teZF1zGWruGOevP9yTZVowE1H03ohr9fARDSBqQAFCXBlK_pJlezQiDfwo18IgN8X5-oVd-_MkZFJLKhuCQ8XFbHC1Ag7fKmqqTHli8UGdOfXqQDiV-jxzX9hGVNUV2TH9iGR9WfwAzGCenZ2s-jNDm_Vb-ieCfjYqQE85z5xpfkzSM_IWG45K6bwsslWL41zX8FraJS5Ii4CeRJSCbO5uDzX8eUs33oXrCj-Wz3l5SOg",
  },
  {
    id: "shadow-wall",
    target_lang: "zh",
    title_cn: "长城之影",
    title_en: "Shadows of the Wall",
    level: "HSK 5",
    level_system: "HSK",
    genre: "History/Sci-Fi",
    locked: true,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAY23k1btIgdPesyxntFo5G0KN7A7e0i_9IafFx_v-faXzCF0oZ6yJyVxFjZUEh_oRShEWZShJFNoMHdFjJMZlx6tzFr5e0PTd7vlOXLb_9j1FqiaMREgIR7s2R1U_JteAs2f3iY7Drcl7s9lI2pEfcVP0I1b9WDwBFSSWBl-5N3P-1Qi6RkHC9bnruOAtUf3UU-mKI4NqhK8jZq12O3Ju41iokvF9YY1VuOp3I5FMdOO85n6WCEor-x_Qxb_i9K65UiGtqdsw16yR8",
  },
];

const START = "start";
const END_ID = "end_back_to_list";

export function isStructuredStory(id: string): boolean {
  return id in LOADERS;
}

export async function loadStory(id: string): Promise<StoryJSON | null> {
  const loader = LOADERS[id];
  if (!loader) return null;
  return loader();
}

/** 列出卡片目录；可按目标语言过滤。 */
export function listCards(target?: TargetLang | null): StoryCard[] {
  return target ? CATALOG.filter((c) => c.target_lang === target) : CATALOG;
}

/**
 * 计算「付费节点」集合：被任意 premium:true 选项指向的目标节点。
 * 这些节点的完整内容只对已订阅用户下发。
 */
export function premiumNodeIds(story: StoryJSON): Set<string> {
  const ids = new Set<string>();
  for (const node of Object.values(story.nodes)) {
    for (const c of node.choices) {
      if (c.premium && c.next_node_id !== END_ID) ids.add(c.next_node_id);
    }
  }
  return ids;
}

/** 由全量故事派生轻量清单（剥离 text_segments / timestamps）。 */
export function toManifest(story: StoryJSON): StoryManifest {
  const premium = premiumNodeIds(story);
  const nodes: Record<string, ManifestNode> = {};
  for (const [id, node] of Object.entries(story.nodes)) {
    nodes[id] = { choices: node.choices, premium: premium.has(id) };
  }
  return {
    story_id: story.story_id,
    target_lang: story.target_lang,
    gloss_lang: story.gloss_lang,
    title_cn: story.title_cn,
    title_en: story.title_en,
    level: story.level,
    level_system: story.level_system,
    start_node_id: START,
    node_count: Object.keys(story.nodes).length,
    nodes,
  };
}

/** 取单个节点的完整可渲染内容；节点不存在返回 null。 */
export function nodeResponse(
  story: StoryJSON,
  nodeId: string
): StoryNodeResponse | null {
  const node = story.nodes[nodeId];
  if (!node) return null;
  return {
    node_id: nodeId,
    bg_image: node.bg_image,
    audio_url: node.audio_url,
    text_segments: node.text_segments,
    timestamps: node.timestamps,
    choices: node.choices,
  };
}
