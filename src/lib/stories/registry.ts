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

/**
 * 资源基址：生产环境指向 Supabase Storage 的 public bucket，
 * 本地开发不配此变量时回退到 public/ 下的相对路径（音频、封面均可本地直读）。
 *
 *   NEXT_PUBLIC_ASSET_BASE_URL=https://<project>.supabase.co/storage/v1/object/public/assets
 *
 * 数据文件（故事 JSON）里仍存相对路径（/audio/xxx），由 assetUrl 在出口处统一拼接，
 * 这样切换存储后端只需改一个环境变量，无需重写任何 JSON。
 */
const ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");

/** 把相对资源路径（/audio/x、/covers/x）映射到当前存储后端的完整 URL。 */
function assetUrl(path: string | null): string | null {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path; // 已是绝对 URL，原样返回
  if (!ASSET_BASE) return path; // 本地开发：交给 Next 直接服务 public/
  return `${ASSET_BASE}/${path.replace(/^\//, "")}`;
}

/** 故事正文加载器（按 story_id 索引；id 全局唯一）。 */
const LOADERS: Record<string, () => Promise<StoryJSON>> = {
  "master-secret": () =>
    import("@/data/stories/zh/master-secret.json").then((m) => m.default as StoryJSON),
  "last-train": () =>
    import("@/data/stories/zh/last-train.json").then((m) => m.default as StoryJSON),
  "haunted-house": () =>
    import("@/data/stories/en/haunted-house.json").then((m) => m.default as StoryJSON),
  "signal-from-the-deep": () =>
    import("@/data/stories/en/signal-from-the-deep.json").then((m) => m.default as StoryJSON),
  "the-rosewood-vanishing": () =>
    import("@/data/stories/en/the-rosewood-vanishing.json").then((m) => m.default as StoryJSON),
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
    image: "/covers/master-secret.png",
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
    image: "/covers/last-train.png",
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
    image: "/covers/haunted-house.png",
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
    image: "/covers/signal-from-the-deep.png",
  },
  {
    id: "the-rosewood-vanishing",
    target_lang: "en",
    title_cn: "玫瑰木失踪案",
    title_en: "The Rosewood Vanishing",
    level: "B2",
    level_system: "CEFR",
    genre: "Detective Noir",
    locked: false,
    image: "/covers/the-rosewood-vanishing.png",
  },
];

const START = "start";
const END_ID = "end_back_to_list";

export async function loadStory(id: string): Promise<StoryJSON | null> {
  const loader = LOADERS[id];
  if (!loader) return null;
  return loader();
}

/** 列出卡片目录；可按目标语言过滤。封面 URL 在出口处映射到当前存储后端。 */
export function listCards(target?: TargetLang | null): StoryCard[] {
  const cards = target ? CATALOG.filter((c) => c.target_lang === target) : CATALOG;
  return cards.map((c) => ({ ...c, image: assetUrl(c.image) ?? c.image }));
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
    bg_image: assetUrl(node.bg_image),
    audio_url: assetUrl(node.audio_url),
    text_segments: node.text_segments,
    timestamps: node.timestamps,
    choices: node.choices,
  };
}
