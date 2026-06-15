// scripts/build-haunted-house.mjs
// 生成 src/data/stories/en/haunted-house.json —— 面向中文母语者的「学英文」demo 故事。
// target_lang: en（正文英文）, gloss_lang: zh（释义中文）, level_system: CEFR。
// 与中文构建脚本同思路：词典 DICT 定义每词的 reading(IPA)/中文释义/CEFR/tier，
// 节点写分词数组，脚本自动算 timestamps（英文按词长估时）并校验。
// 运行：node scripts/build-haunted-house.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "stories", "en");
const OUT = join(OUT_DIR, "haunted-house.json");

// 极常见功能词 → tier:"base"（不高亮、无 tooltip）。标点同样按 base。
const BASE_WORDS = new Set([
  "the", "a", "an", "you", "i", "he", "she", "it", "we", "they", "to", "of",
  "in", "on", "at", "is", "are", "was", "were", "and", "but", "or", "your",
  "as", "so", "up", "out", "had", "has", "have", "this", "that", "with",
  "for", "its", "into", "no", "not", "be", "by",
]);

// 生词词典：word -> [reading(IPA), 中文释义, CEFR, tier, isPlotKeyword?]
// tier: n=normal（一般生词）, k=key（高级/剧情词）
const DICT = {
  // 剧情关键词
  "mansion": ["ˈmænʃən", "大宅；宅邸", "B1", "k", 1],
  "abandoned": ["əˈbændənd", "废弃的；被遗弃的", "B1", "k", 1],
  "creaked": ["kriːkt", "发出咯吱声", "B2", "k"],
  "hallway": ["ˈhɔːlweɪ", "走廊；门厅", "A2", "n", 1],
  "flickering": ["ˈflɪkərɪŋ", "闪烁的", "B2", "k"],
  "candle": ["ˈkændl", "蜡烛", "A2", "n", 1],
  "whisper": ["ˈwɪspər", "低语；耳语", "B1", "k", 1],
  "staircase": ["ˈsteərkeɪs", "楼梯", "B1", "n", 1],
  "basement": ["ˈbeɪsmənt", "地下室", "A2", "n", 1],
  "portrait": ["ˈpɔːtrət", "肖像画", "B1", "k", 1],
  "mirror": ["ˈmɪrər", "镜子", "A2", "n", 1],
  "ghost": ["ɡəʊst", "鬼魂", "A2", "n", 1],
  "reflection": ["rɪˈflekʃən", "倒影；映像", "B2", "k", 1],
  "diary": ["ˈdaɪəri", "日记", "A2", "n", 1],
  "trapped": ["træpt", "被困住的", "B1", "k", 1],
  "curse": ["kɜːs", "诅咒", "B2", "k", 1],
  "dawn": ["dɔːn", "黎明", "B1", "k", 1],
  // 普通生词
  "stood": ["stʊd", "矗立；站立", "A2", "n"],
  "before": ["bɪˈfɔːr", "在……前", "A2", "n"],
  "rusty": ["ˈrʌsti", "生锈的", "B1", "k"],
  "gate": ["ɡeɪt", "大门", "A2", "n"],
  "rain": ["reɪn", "雨", "A1", "n"],
  "soaked": ["səʊkt", "湿透", "B2", "k"],
  "through": ["θruː", "穿过", "A2", "n"],
  "cold": ["kəʊld", "寒冷的", "A1", "n"],
  "pushed": ["pʊʃt", "推", "A1", "n"],
  "open": ["ˈəʊpən", "打开", "A1", "n"],
  "door": ["dɔːr", "门", "A1", "n"],
  "inside": ["ɪnˈsaɪd", "里面", "A1", "n"],
  "air": ["eər", "空气", "A1", "n"],
  "smelled": ["smeld", "闻起来", "A2", "n"],
  "dust": ["dʌst", "灰尘", "A2", "n"],
  "something": ["ˈsʌmθɪŋ", "某物", "A1", "n"],
  "moved": ["muːvd", "移动", "A1", "n"],
  "darkness": ["ˈdɑːknəs", "黑暗", "B1", "k"],
  "explore": ["ɪkˈsplɔːr", "探索", "B1", "n"],
  "climb": ["klaɪm", "攀爬；上（楼）", "A2", "n"],
  "follow": ["ˈfɒləʊ", "跟随", "A2", "n"],
  "sound": ["saʊnd", "声音", "A1", "n"],
  "leave": ["liːv", "离开", "A1", "n"],
  "down": ["daʊn", "向下", "A1", "n"],
  "steps": ["steps", "台阶", "A1", "n"],
  "wall": ["wɔːl", "墙", "A1", "n"],
  "old": ["əʊld", "古老的", "A1", "n"],
  "hanging": ["ˈhæŋɪŋ", "悬挂着", "A2", "n"],
  "watched": ["wɒtʃt", "注视", "A1", "n"],
  "eyes": ["aɪz", "眼睛", "A1", "n"],
  "seemed": ["siːmd", "似乎", "B1", "n"],
  "alive": ["əˈlaɪv", "活着的", "A2", "n"],
  "voice": ["vɔɪs", "嗓音", "A1", "n"],
  "behind": ["bɪˈhaɪnd", "在……后面", "A2", "n"],
  "called": ["kɔːld", "呼唤", "A1", "n"],
  "name": ["neɪm", "名字", "A1", "n"],
  "turned": ["tɜːnd", "转身", "A1", "n"],
  "saw": ["sɔː", "看见", "A1", "n"],
  "woman": ["ˈwʊmən", "女人", "A1", "n"],
  "white": ["waɪt", "白色的", "A1", "n"],
  "dress": ["dres", "连衣裙", "A1", "n"],
  "floating": ["ˈfləʊtɪŋ", "漂浮", "B1", "k"],
  "reached": ["riːtʃt", "伸手；到达", "A2", "n"],
  "toward": ["təˈwɔːd", "朝向", "B1", "n"],
  "ran": ["ræn", "奔跑", "A1", "n"],
  "fast": ["fɑːst", "快速地", "A1", "n"],
  "could": ["kʊd", "能够", "A1", "n"],
  "found": ["faʊnd", "找到", "A1", "n"],
  "dusty": ["ˈdʌsti", "满是灰尘的", "B1", "n"],
  "table": ["ˈteɪbl", "桌子", "A1", "n"],
  "wrote": ["rəʊt", "写", "A1", "n"],
  "read": ["red", "读", "A1", "n"],
  "pages": ["ˈpeɪdʒɪz", "书页", "A1", "n"],
  "words": ["wɜːdz", "文字", "A1", "n"],
  "must": ["mʌst", "必须", "A2", "n"],
  "escape": ["ɪˈskeɪp", "逃脱", "B1", "k", 1],
  "until": ["ənˈtɪl", "直到", "A2", "n"],
  "first": ["fɜːst", "第一缕的", "A1", "n"],
  "light": ["laɪt", "光", "A1", "n"],
  "morning": ["ˈmɔːnɪŋ", "早晨", "A1", "n"],
  "waited": ["ˈweɪtɪd", "等待", "A1", "n"],
  "broke": ["brəʊk", "（天）破晓", "A2", "n"],
  "window": ["ˈwɪndəʊ", "窗户", "A1", "n"],
  "finally": ["ˈfaɪnəli", "终于", "A2", "n"],
  "free": ["friː", "自由的", "A1", "n", 1],
  "stepped": ["stept", "迈步", "A2", "n"],
  "never": ["ˈnevər", "再也不", "A1", "n"],
  "looked": ["lʊkt", "看", "A1", "n"],
  "back": ["bæk", "回（头）", "A1", "n"],
  "touched": ["tʌtʃt", "触碰", "A1", "n"],
  "glass": ["ɡlɑːs", "玻璃", "A2", "n"],
  "pulled": ["pʊld", "拉；拽", "A1", "n"],
  "forever": ["fərˈevər", "永远", "A2", "k"],
  "screamed": ["skriːmd", "尖叫", "B1", "k"],
  "silence": ["ˈsaɪləns", "寂静", "B1", "k"],
  "answered": ["ˈɑːnsəd", "回应", "A2", "n"],
  "clothes": ["kləʊðz", "衣服", "A1", "n"],
  "long": ["lɒŋ", "长的", "A1", "n"],
  "small": ["smɔːl", "小的", "A1", "n"],
  "hung": ["hʌŋ", "悬挂（hang 过去式）", "A2", "n"],
  "whispered": ["ˈwɪspəd", "低声说", "B1", "k"],
  "end": ["end", "尽头", "A1", "n"],
  "always": ["ˈɔːlweɪz", "总是", "A1", "n"],
  "said": ["sed", "说（say 过去式）", "A1", "n"],
  "cursed": ["kɜːst", "被诅咒的", "B2", "k", 1],
  "stay": ["steɪ", "停留", "A1", "n"],
  "here": ["hɪər", "这里", "A1", "n"],
  "hands": ["hændz", "手", "A1", "n"],
  "understood": ["ˌʌndəˈstʊd", "明白（understand 过去式）", "A2", "n"],
  "danger": ["ˈdeɪndʒər", "危险", "A2", "n", 1],
  "climbed": ["klaɪmd", "攀爬（过去式）", "A2", "n"],
  "each": ["iːtʃ", "每一", "A2", "n"],
  "step": ["step", "台阶", "A1", "n"],
  "under": ["ˈʌndər", "在……下", "A1", "n"],
  "feet": ["fiːt", "脚（foot 复数）", "A1", "n"],
  "top": ["tɒp", "顶端", "A1", "n"],
  "large": ["lɑːdʒ", "大的", "A1", "n"],
  "standing": ["ˈstændɪŋ", "站立着", "A1", "n"],
  "right": ["raɪt", "正好；就在", "A1", "n"],
  "now": ["naʊ", "现在", "A1", "n"],
  "empty": ["ˈempti", "空的", "A2", "n"],
  "from": ["frɒm", "从", "A1", "n"],
  "only": ["ˈəʊnli", "只有", "A1", "n"],
  "followed": ["ˈfɒləʊd", "跟随（过去式）", "A2", "n"],
  "black": ["blæk", "漆黑的", "A1", "n"],
  "single": ["ˈsɪŋɡl", "单一的", "A2", "n"],
  "floor": ["flɔːr", "地板", "A1", "n"],
  "beside": ["bɪˈsaɪd", "在……旁边", "A2", "n"],
  "when": ["wen", "当……时", "A1", "n"],
  "gone": ["ɡɒn", "消失的（go 过去分词）", "A2", "n"],
  "opened": ["ˈəʊpənd", "打开（过去式）", "A1", "n"],
  "outside": ["ˌaʊtˈsaɪd", "外面", "A1", "n"],
  "__PH__": ["", "", "", ""],
};

const PUNCT = /^[.,!?:;"'—…“”‘’]+$/;
const TIER = { n: "normal", k: "key" };
const missing = new Set();

// 英文按词估时：标点短；单词按字符数（含一点基线）估朗读时长（毫秒）。
function durationOf(word, isBase) {
  if (PUNCT.test(word)) return 180;
  const len = word.replace(/[^A-Za-z]/g, "").length || 1;
  const base = isBase ? 120 : 180;
  return Math.min(base + len * 55, 1400);
}

// 把分词数组编译成 { text_segments, timestamps }
function compile(nodeId, tokens) {
  const segs = [];
  const ts = [];
  let cursor = 0;
  for (const raw of tokens) {
    const isPunct = PUNCT.test(raw);
    const key = raw.toLowerCase().replace(/[.,!?:;"'—…]/g, "");
    const dict = DICT[key];
    let seg;
    if (isPunct) {
      seg = { word: raw, reading: null, meaning: null, level: null, tier: "base" };
    } else if (BASE_WORDS.has(key)) {
      seg = { word: raw, reading: null, meaning: null, level: null, tier: "base" };
    } else if (dict) {
      const [reading, meaning, level, t, plot] = dict;
      seg = { word: raw, reading, meaning, level, tier: TIER[t] };
      if (plot) seg.isPlotKeyword = true;
    } else {
      missing.add(key);
      seg = { word: raw, reading: "?", meaning: "?", level: "B1", tier: "normal" };
    }
    segs.push(seg);
    const dur = durationOf(raw, seg.tier === "base");
    ts.push({ start: cursor, end: cursor + dur });
    cursor += dur;
  }
  return { text_segments: segs, timestamps: ts };
}

// 分词助手：英文按空格切，标点作为独立 token（句末 . , ! ? 等）。
function tok(sentence) {
  return sentence
    .replace(/([.,!?:;])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// —— 故事节点 ——
// 设计：start + 3 一级分支 + 各 1~2 子节点，4 个结局，约 10 节点。
// 题材：废弃鬼宅，限时在黎明前逃脱。
const NODES = {
  start: {
    text: "You stood before the rusty gate of an abandoned mansion. Cold rain soaked through your clothes. You pushed the door open and stepped inside. The air smelled of dust, and in the darkness, something moved.",
    choices: [
      ["A. Explore the dark hallway", "hallway"],
      ["B. Climb the old staircase", "staircase"],
      ["C. Follow the strange sound down", "basement"],
    ],
  },
  hallway: {
    text: "The hallway was long and cold. A flickering candle stood on a small table. On the wall hung an old portrait, and its eyes seemed alive. A voice behind you whispered your name.",
    choices: [
      ["A1. Turn and look behind you", "white_woman"],
      ["A2. Read the dusty diary on the table", "diary"],
    ],
  },
  white_woman: {
    text: "You turned and saw a woman in a white dress, floating in the darkness. She reached toward you. You screamed and ran as fast as you could, but the hallway had no end. The ghost was always behind you.",
    choices: [["[ Back to library ]", "END"]],
  },
  diary: {
    text: "You read the dusty pages. The words said: the mansion is cursed, and you must escape before dawn, or stay here forever. Your hands were cold. You finally understood the danger.",
    choices: [
      ["1. Run to find a way out before dawn", "wait_dawn"],
      ["2. Look for the ghost's secret", "basement"],
    ],
  },
  staircase: {
    text: "You climbed the old staircase. Each step creaked under your feet. At the top, a large mirror hung on the wall. In its reflection, you saw a ghost standing right behind you.",
    choices: [
      ["B1. Touch the mirror", "mirror_trap"],
      ["B2. Run back down the steps", "basement"],
    ],
  },
  mirror_trap: {
    text: "You touched the cold glass. The mirror pulled you inside. Now you watched the empty hallway from behind the glass, trapped in the reflection forever. You screamed, but only silence answered.",
    choices: [["[ Back to library ]", "END"]],
  },
  basement: {
    text: "You followed the sound down into the basement. It was cold and black. A single candle was flickering on the floor. Beside it, an old diary waited, its pages open.",
    choices: [
      ["1. Read the diary", "diary"],
      ["2. Wait here until dawn", "wait_dawn"],
    ],
  },
  wait_dawn: {
    text: "You waited in the darkness until the first light of morning. When dawn finally broke through the window, the cold air was gone. The door opened, and you were free. You stepped outside and never looked back.",
    choices: [["[ Back to library ]", "END"]],
  },
};

mkdirSync(OUT_DIR, { recursive: true });

const nodes = {};
for (const [id, def] of Object.entries(NODES)) {
  const { text_segments, timestamps } = compile(id, tok(def.text));
  const choices = def.choices.map(([text, target]) => ({
    text,
    next_node_id: target === "END" ? "end_back_to_list" : target,
  }));
  nodes[id] = { bg_image: null, audio_url: null, text_segments, timestamps, choices };
}

const story = {
  story_id: "haunted-house",
  target_lang: "en",
  gloss_lang: "zh",
  title_cn: "鬼屋一夜",
  title_en: "One Night in the Haunted House",
  level: "B1",
  level_system: "CEFR",
  nodes,
};

// —— 校验 ——
const ids = new Set(Object.keys(nodes));
let ok = true;
for (const [id, n] of Object.entries(nodes)) {
  if (n.text_segments.length !== n.timestamps.length) {
    console.error(`✗ ${id}: segments != timestamps`); ok = false;
  }
  n.text_segments.forEach((s, i) => {
    if (s.tier !== "base" && (!s.reading || !s.meaning || !s.level))
      { console.error(`✗ ${id}[${i}] "${s.word}": 缺字段`); ok = false; }
  });
  for (const c of n.choices)
    if (c.next_node_id !== "end_back_to_list" && !ids.has(c.next_node_id))
      { console.error(`✗ ${id}: 断链 -> ${c.next_node_id}`); ok = false; }
}
const reach = new Set(["start"]); let ch = true;
while (ch) { ch = false; for (const id of [...reach]) for (const c of nodes[id].choices)
  if (ids.has(c.next_node_id) && !reach.has(c.next_node_id)) { reach.add(c.next_node_id); ch = true; } }
for (const id of ids) if (!reach.has(id)) { console.error(`✗ 孤立节点: ${id}`); ok = false; }

if (missing.size) {
  console.error("✗ 以下词缺词典定义：\n" + [...missing].map((w) => `  "${w}"`).join("\n"));
  process.exit(1);
}
if (!ok) { console.error("校验失败，未写出。"); process.exit(1); }

writeFileSync(OUT, JSON.stringify(story, null, 2) + "\n");
console.log(`✓ 写出 ${OUT}（${ids.size} 节点，全部校验通过）`);

export {};
