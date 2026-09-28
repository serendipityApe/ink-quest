import type {
  StoryJSON,
  StoryManifest,
  ManifestNode,
  StoryNodeResponse,
  StoryCard,
  TargetLang,
} from "@/types/story";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
  if (process.env.NODE_ENV === "development" && existsSync(join(process.cwd(), "public", path))) {
    return path;
  }
  if (!ASSET_BASE) return path; // 本地开发：交给 Next 直接服务 public/
  return `${ASSET_BASE}/${path.replace(/^\//, "")}`;
}

/** 故事正文加载器（按 story_id 索引；id 全局唯一）。 */
const LOADERS: Record<string, () => Promise<StoryJSON>> = {
  "the-borrowed-sect-1": () =>
    import("@/data/stories/zh/the-borrowed-sect-1.json").then((m) => m.default as StoryJSON),
  "the-seven-oclock-lost-and-found": () =>
    import("@/data/stories/zh/the-seven-oclock-lost-and-found.json").then((m) => m.default as StoryJSON),
  "the-moon-greenhouse": () =>
    import("@/data/stories/zh/the-moon-greenhouse.json").then((m) => m.default as StoryJSON),
  "before-the-rain-stops": () =>
    import("@/data/stories/zh/before-the-rain-stops.json").then((m) => m.default as StoryJSON),
  "manager-for-a-day": () =>
    import("@/data/stories/zh/manager-for-a-day.json").then((m) => m.default as StoryJSON),
  "master-secret": () =>
    import("@/data/stories/zh/master-secret.json").then((m) => m.default as StoryJSON),
  "last-train": () =>
    import("@/data/stories/zh/last-train.json").then((m) => m.default as StoryJSON),
  "signal-from-the-deep": () =>
    import("@/data/stories/en/signal-from-the-deep.json").then((m) => m.default as StoryJSON),
  "the-rosewood-vanishing": () =>
    import("@/data/stories/en/the-rosewood-vanishing.json").then((m) => m.default as StoryJSON),
  "receipt-from-tomorrow": () =>
    import("@/data/stories/en/receipt-from-tomorrow.json").then((m) => m.default as StoryJSON),
  "receipt-from-tomorrow-zh": () =>
    import("@/data/stories/zh/receipt-from-tomorrow-zh.json").then((m) => m.default as StoryJSON),
  "the-museum-after-closing": () =>
    import("@/data/stories/en/the-museum-after-closing.json").then((m) => m.default as StoryJSON),
  "the-interview-with-my-future-self": () =>
    import("@/data/stories/en/the-interview-with-my-future-self.json").then((m) => m.default as StoryJSON),
};

/**
 * 卡片目录：列表页/首页所需的展示元数据（封面、genre、锁定态等）。
 * 与正文数据分离，列表页无需加载任何故事内容即可渲染。
 */
const CATALOG: StoryCard[] = [
  {
    id: "the-borrowed-sect-1",
    description_en: "A copper key leads you to a mountain sect with full pools and a dry village below. Uncover an old promise in part 1 of this HSK 4 Chinese xianxia story.",
    description_cn: "父亲的铜钥匙带你来到一座修仙山门。山上的水池满了，山下却无水可用。追查一份借山旧约，决定如何让山泉重新流向村庄。",
    series: { id: "the-borrowed-sect", title_en: "The Borrowed Sect", title_cn: "借来的山门", part: 1 },
    target_lang: "zh",
    title_cn: "借来的山门 1：山下无水",
    title_en: "The Borrowed Sect 1: The Dry Village",
    level: "HSK 4",
    level_system: "HSK",
    genre: "Xianxia",
    locked: false,
    image: "/covers/the-borrowed-sect-1-inkwash.png",
  },
  {
    id: "the-seven-oclock-lost-and-found",
    description_en: "A station lost and found closes at seven. Help an elderly man recover a bag holding his wife's voice in this HSK 4 interactive Chinese mystery.",
    description_cn: "失物处七点就要搬空，一位老人却找不到装着妻子录音的蓝布包。沿登记簿或站台追查，在最后一班车开走前找到它。",
    target_lang: "zh",
    title_cn: "七点前的失物",
    title_en: "Lost and Found Before Seven",
    level: "HSK 4",
    level_system: "HSK",
    genre: "Mystery",
    locked: false,
    image: "/covers/the-seven-oclock-lost-and-found-v2.png",
    imagePosition: "center 20%",
  },
  {
    id: "the-moon-greenhouse",
    description_en: "The lunar night is coming and the greenhouse is using too much power. Choose what to save in this HSK 4 interactive Chinese science fiction story.",
    description_cn: "月球基地即将进入长夜，温室用电却突然升高。系统建议拔掉一排花，你和同伴要查清原因，在有限电力中决定保住什么。",
    target_lang: "zh",
    title_cn: "月面温室",
    title_en: "The Moon Greenhouse",
    level: "HSK 4",
    level_system: "HSK",
    genre: "Science Fiction",
    locked: false,
    image: "/covers/the-moon-greenhouse-v2.png",
    imagePosition: "center 20%",
  },
  {
    id: "before-the-rain-stops",
    description_en: "On your last evening at a neighborhood bookshop, rain brings a familiar visitor back. Choose your next step in this HSK 3 Chinese romance story.",
    description_cn: "这是你离开城市前在书店的最后一个晚班。常客林安冒雨归还一本书，旧地图和共同的批注，让你们有机会说清彼此的心意。",
    target_lang: "zh",
    title_cn: "雨停之前",
    title_en: "Before the Rain Stops",
    level: "HSK 3",
    level_system: "HSK",
    genre: "Romance",
    locked: false,
    image: "/covers/before-the-rain-stops-v2.png",
  },
  {
    id: "manager-for-a-day",
    description_en: "Your boss leaves you in charge of the lunch rush. Untangle confusing orders and keep everyone fed in this HSK 3 interactive Chinese comedy.",
    description_cn: "老板临时离开，你第一次代管午市。十二份午饭、重复小票和要安静座位的客人同时出现，你要和厨房一起把这顿午饭安排好。",
    target_lang: "zh",
    title_cn: "今天谁当店长",
    title_en: "Manager for a Day",
    level: "HSK 3",
    level_system: "HSK",
    genre: "Comedy",
    locked: false,
    image: "/covers/manager-for-a-day-v2.png",
    imagePosition: "center 20%",
  },
  {
    id: "signal-from-the-deep",
    description_en: "Alone on the night shift at an ocean research station, you receive a strange signal from the deep. Explore this B1 interactive English thriller.",
    description_cn: "海洋研究站的夜班只有你一人值守，平静海面下却传来陌生信号。调查信号来源，决定接下来如何行动。",
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
    description_en: "A singer has vanished from the Rosewood Club. Follow the clues behind her disappearance in this B2 interactive English detective story.",
    description_cn: "午夜，一位女子带来妹妹的照片。玫瑰木俱乐部的歌手已失踪三夜，你要在雨中的城市寻找警方忽略的线索。",
    target_lang: "en",
    title_cn: "玫瑰木失踪案",
    title_en: "The Rosewood Vanishing",
    level: "B2",
    level_system: "CEFR",
    genre: "Detective Noir",
    locked: false,
    image: "/covers/the-rosewood-vanishing.png",
  },
  {
    id: "receipt-from-tomorrow",
    description_en: "A late-night coffee receipt predicts your death at North Station tomorrow. Choose how to face the warning in this B1 interactive English mystery.",
    description_cn: "深夜买咖啡时，一张温热的收据预告了你明天在北站的死亡。追查警告的来源，选择如何面对尚未发生的事。",
    target_lang: "en",
    title_cn: "来自明天的收据",
    title_en: "The Receipt from Tomorrow",
    level: "B1",
    level_system: "CEFR",
    genre: "Urban Mystery",
    locked: false,
    image: "/covers/receipt-from-tomorrow.svg",
  },
  {
    id: "receipt-from-tomorrow-zh",
    description_en: "A coffee receipt names you as tomorrow's payer and demands a life. Follow its warning in this HSK 5 interactive Chinese mystery.",
    description_cn: "便利店的收据上印着明天的时间、北站三号门和你的名字，应付的却是一条命。你要追查这笔尚未发生的交易。",
    target_lang: "zh",
    title_cn: "来自明天的收据",
    title_en: "The Receipt from Tomorrow",
    level: "HSK 5",
    level_system: "HSK",
    genre: "Urban Mystery",
    locked: false,
    image: "/covers/receipt-from-tomorrow-zh.svg",
  },
  {
    id: "the-museum-after-closing",
    description_en: "On your first museum night shift, a display label warns of a theft that has not happened yet. Investigate this B1 interactive English mystery.",
    description_cn: "博物馆闭馆后，你的第一个夜班开始了。一块展品标签自行改写，警告窃贼已经进入，却尚未下手。",
    target_lang: "en",
    title_cn: "闭馆后的博物馆",
    title_en: "The Museum After Closing",
    level: "B1",
    level_system: "CEFR",
    genre: "Supernatural Mystery",
    locked: false,
    image: "/covers/the-museum-after-closing.svg",
  },
  {
    id: "the-interview-with-my-future-self",
    description_en: "You arrive for a job interview and meet an older version of yourself. Decide what to trust in this B1 interactive English science fiction story.",
    description_cn: "你准时来到四十二楼参加面试，面试官却长着一张与你相同、只是更加年长的脸。面对未来的自己，你会相信什么？",
    target_lang: "en",
    title_cn: "与未来自己的面试",
    title_en: "The Interview with My Future Self",
    level: "B1",
    level_system: "CEFR",
    genre: "Psychological Sci-Fi",
    locked: false,
    image: "/covers/the-interview-with-my-future-self.svg",
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
