// scripts/build-last-train.mjs
// 生成 src/data/last-train.json（结构化互动故事）。
// 设计：一份全局词典 DICT 定义每个生词的 pinyin/释义/HSK 等级/高亮 tier，
// 每个节点只写「分词后的文本数组」，脚本自动：
//   1) 把词查 DICT 补全字段；2) 按朗读节奏算 timestamps；3) 校验对齐与断链。
// 重新生成：node scripts/build-last-train.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "stories", "zh", "last-train.json");

// 极常见虚词/代词 → tier:"base"，不高亮、无 tooltip。标点与引号对白也按 base 处理。
const BASE_WORDS = new Set([
  "你", "我", "他", "的", "了", "在", "着", "中", "上", "里", "得", "也", "是",
  "和", "又", "就", "都", "还", "把", "向", "为", "这", "那", "他们", "一下子",
]);

// 生词词典：word -> [pinyin, meaning, HSK, tier, isPlotKeyword?]
// tier: n=normal（一般生词，hover 出 tooltip）, k=key（高级词/剧情词，立即出 tooltip）
const DICT = {
  // —— 反复出现的剧情关键词 ——
  "末班": ["mò bān", "last (scheduled run)", "HSK 5", "k", 1],
  "地铁": ["dì tiě", "subway", "HSK 3", "n"],
  "车厢": ["chē xiāng", "train carriage", "HSK 5", "k", 1],
  "报站声": ["bào zhàn shēng", "station announcement", "HSK 6", "k", 1],
  "站名": ["zhàn míng", "station name", "HSK 5", "k", 1],
  "乘客": ["chéng kè", "passenger", "HSK 4", "n", 1],
  "倒影": ["dào yǐng", "reflection", "HSK 6", "k", 1],
  "老人": ["lǎo rén", "old person", "HSK 2", "n"],
  "司机": ["sī jī", "driver", "HSK 3", "n", 1],
  "引路人": ["yǐn lù rén", "guide; the one who leads the way", "HSK 7", "k", 1],
  "站台": ["zhàn tái", "platform", "HSK 5", "k", 1],
  "终点": ["zhōng diǎn", "terminus; end point", "HSK 5", "k", 1],
  "循环": ["xún huán", "loop; cycle", "HSK 6", "k", 1],
  "车票": ["chē piào", "train ticket", "HSK 4", "n", 1],
  "诡异": ["guǐ yì", "eerie; weird", "HSK 6", "k", 1],
  "隧道": ["suì dào", "tunnel", "HSK 6", "k", 1],
  "操纵杆": ["cāo zòng gǎn", "control lever; joystick", "HSK 7", "k", 1],
  "驾驶室": ["jià shǐ shì", "driver's cab", "HSK 6", "k", 1],
  "制动闸": ["zhì dòng zhá", "emergency brake", "HSK 7", "k", 1],
  // —— 普通生词 ——
  "缓缓": ["huǎn huǎn", "slowly", "HSK 5", "k"],
  "进站": ["jìn zhàn", "pull into the station", "HSK 4", "n"],
  "拖着": ["tuō zhe", "dragging", "HSK 4", "n"],
  "疲惫": ["pí bèi", "exhausted", "HSK 5", "k"],
  "身体": ["shēn tǐ", "body", "HSK 2", "n"],
  "走进": ["zǒu jìn", "walk into", "HSK 2", "n"],
  "忽然": ["hū rán", "suddenly", "HSK 3", "n"],
  "响起": ["xiǎng qǐ", "ring out; sound", "HSK 4", "n"],
  "那个": ["nà gè", "that", "HSK 1", "n"],
  "从来": ["cóng lái", "ever; always", "HSK 3", "n"],
  "没有": ["méi yǒu", "have not", "HSK 1", "n"],
  "听过": ["tīng guò", "heard before", "HSK 2", "n"],
  "坐满了": ["zuò mǎn le", "fully seated", "HSK 3", "n"],
  "却": ["què", "yet; but", "HSK 3", "n"],
  "安静": ["ān jìng", "quiet", "HSK 3", "n"],
  "悄悄": ["qiāo qiāo", "quietly", "HSK 4", "n"],
  "打量": ["dǎ liang", "size up; look over", "HSK 5", "k"],
  "四周": ["sì zhōu", "all around", "HSK 4", "n"],
  "个个": ["gè gè", "each and every one", "HSK 4", "n"],
  "低着头": ["dī zhe tóu", "head lowered", "HSK 3", "n"],
  "一动不动": ["yī dòng bù dòng", "motionless", "HSK 5", "k"],
  "无意中": ["wú yì zhōng", "inadvertently", "HSK 5", "k"],
  "瞥见": ["piē jiàn", "catch a glimpse of", "HSK 6", "k"],
  "车窗": ["chē chuāng", "train window", "HSK 4", "n"],
  "玻璃": ["bō li", "glass", "HSK 4", "n"],
  "座位": ["zuò wèi", "seat", "HSK 4", "n"],
  "竟然": ["jìng rán", "unexpectedly", "HSK 4", "n"],
  "全是": ["quán shì", "all are", "HSK 2", "n"],
  "空": ["kōng", "empty", "HSK 3", "n"],
  "鼓起": ["gǔ qǐ", "muster up", "HSK 5", "k"],
  "勇气": ["yǒng qì", "courage", "HSK 4", "n"],
  "转头": ["zhuǎn tóu", "turn one's head", "HSK 3", "n"],
  "看向": ["kàn xiàng", "look toward", "HSK 2", "n"],
  "身边": ["shēn biān", "beside one", "HSK 3", "n"],
  "那一刻": ["nà yī kè", "at that moment", "HSK 4", "n"],
  "浑身": ["hún shēn", "all over the body", "HSK 5", "k"],
  "冰凉": ["bīng liáng", "ice-cold", "HSK 4", "n"],
  "全都": ["quán dōu", "all", "HSK 3", "n"],
  "脸": ["liǎn", "face", "HSK 3", "n", 1],
  "只有": ["zhǐ yǒu", "only", "HSK 2", "n"],
  "一片": ["yī piàn", "a stretch of", "HSK 3", "n"],
  "模糊": ["mó hu", "blurry; indistinct", "HSK 4", "n"],
  "灰白": ["huī bái", "ashen grey", "HSK 5", "k"],
  "终于": ["zhōng yú", "finally", "HSK 3", "n"],
  "明白": ["míng bái", "understand", "HSK 3", "n"],
  "自己": ["zì jǐ", "oneself", "HSK 3", "n"],
  "或许": ["huò xǔ", "perhaps", "HSK 5", "k"],
  "早已": ["zǎo yǐ", "long since", "HSK 5", "k"],
  "一员": ["yī yuán", "a member", "HSK 5", "k", 1],
  "走到": ["zǒu dào", "walk over to", "HSK 2", "n"],
  "角落": ["jiǎo luò", "corner", "HSK 4", "n"],
  "那里": ["nà lǐ", "there", "HSK 1", "n"],
  "坐着": ["zuò zhe", "is sitting", "HSK 2", "n"],
  "一位": ["yī wèi", "one (polite)", "HSK 3", "n"],
  "白发": ["bái fà", "white-haired", "HSK 4", "n"],
  "轻声": ["qīng shēng", "in a low voice", "HSK 4", "n"],
  "问": ["wèn", "ask", "HSK 1", "n"],
  "抬起头": ["tái qǐ tóu", "lift one's head", "HSK 3", "n"],
  "浑浊": ["hún zhuó", "murky; cloudy", "HSK 6", "k"],
  "眼睛": ["yǎn jīng", "eyes", "HSK 2", "n"],
  "盯着": ["dīng zhe", "stare at", "HSK 4", "n"],
  "低声": ["dī shēng", "in a low voice", "HSK 5", "k"],
  "说": ["shuō", "say", "HSK 1", "n"],
  "心头": ["xīn tóu", "in one's heart", "HSK 5", "k"],
  "一紧": ["yī jǐn", "tighten", "HSK 4", "n"],
  "追问": ["zhuī wèn", "press for an answer", "HSK 5", "k"],
  "道": ["dào", "said", "HSK 2", "n"],
  "叹了口气": ["tàn le kǒu qì", "let out a sigh", "HSK 4", "n"],
  "指向": ["zhǐ xiàng", "point toward", "HSK 4", "n"],
  "窗外": ["chuāng wài", "outside the window", "HSK 3", "n"],
  "永远": ["yǒng yuǎn", "forever", "HSK 4", "n"],
  "到不了": ["dào bù liǎo", "can never reach", "HSK 3", "n"],
  "黑暗": ["hēi àn", "darkness", "HSK 4", "n"],
  "同一个": ["tóng yī gè", "the same", "HSK 3", "n"],
  "正在": ["zhèng zài", "in the midst of", "HSK 2", "n"],
  "一遍遍": ["yī biàn biàn", "over and over", "HSK 4", "n"],
  "重复": ["chóng fù", "repeat", "HSK 4", "n", 1],
  "闪过": ["shǎn guò", "flash past", "HSK 4", "n"],
  "起身": ["qǐ shēn", "rise to one's feet", "HSK 4", "n"],
  "穿过": ["chuān guò", "pass through", "HSK 4", "n"],
  "一节节": ["yī jié jié", "car after car", "HSK 5", "k"],
  "越来越": ["yuè lái yuè", "more and more", "HSK 3", "n"],
  "破旧": ["pò jiù", "shabby; worn-out", "HSK 5", "k"],
  "尽头": ["jìn tóu", "the far end", "HSK 5", "k"],
  "一扇": ["yī shàn", "one (for doors)", "HSK 5", "k"],
  "铁门": ["tiě mén", "iron door", "HSK 4", "n"],
  "旁边": ["páng biān", "beside", "HSK 2", "n"],
  "红色": ["hóng sè", "red", "HSK 2", "n"],
  "拉下": ["lā xià", "pull down", "HSK 3", "n"],
  "推开": ["tuī kāi", "push open", "HSK 3", "n"],
  "回到": ["huí dào", "return to", "HSK 2", "n"],
  "犹豫": ["yóu yù", "hesitate", "HSK 5", "k"],
  "片刻": ["piàn kè", "a moment", "HSK 6", "k"],
  "猛地": ["měng de", "abruptly", "HSK 5", "k"],
  "急刹": ["jí shā", "slam the brakes", "HSK 5", "k"],
  "灯光": ["dēng guāng", "the lights", "HSK 3", "n"],
  "闪烁": ["shǎn shuò", "flicker", "HSK 6", "k"],
  "车门": ["chē mén", "train door", "HSK 3", "n"],
  "打开": ["dǎ kāi", "open", "HSK 2", "n"],
  "站牌": ["zhàn pái", "station sign", "HSK 5", "k"],
  "依旧": ["yī jiù", "still; as before", "HSK 5", "k"],
  "陌生": ["mò shēng", "unfamiliar", "HSK 4", "n", 1],
  "踏上": ["tà shàng", "step onto", "HSK 5", "k"],
  "留在": ["liú zài", "stay on", "HSK 2", "n"],
  "等候": ["děng hòu", "wait for", "HSK 5", "k"],
  "不顾": ["bù gù", "regardless of", "HSK 5", "k"],
  "一切": ["yī qiè", "everything", "HSK 4", "n"],
  "眼前": ["yǎn qián", "before one's eyes", "HSK 4", "n"],
  "景象": ["jǐng xiàng", "scene; sight", "HSK 5", "k"],
  "让": ["ràng", "make; let", "HSK 2", "n"],
  "僵住了": ["jiāng zhù le", "froze stiff", "HSK 5", "k"],
  "一模一样": ["yī mú yī yàng", "exactly identical", "HSK 5", "k", 1],
  "正": ["zhèng", "right then", "HSK 2", "n"],
  "等着": ["děng zhe", "waiting", "HSK 2", "n"],
  "递给": ["dì gěi", "hand over to", "HSK 4", "n"],
  "一张": ["yī zhāng", "one (flat object)", "HSK 2", "n"],
  "泛黄": ["fàn huáng", "yellowed (with age)", "HSK 6", "k"],
  "旧": ["jiù", "old; worn", "HSK 2", "n"],
  "压低": ["yā dī", "lower (voice)", "HSK 5", "k"],
  "声音": ["shēng yīn", "voice", "HSK 2", "n"],
  "嘱咐": ["zhǔ fù", "exhort; instruct", "HSK 6", "k"],
  "千万": ["qiān wàn", "by all means; whatever you do", "HSK 4", "n"],
  "别": ["bié", "don't", "HSK 2", "n"],
  "去碰": ["qù pèng", "go touch", "HSK 3", "n"],
  "车头": ["chē tóu", "front of the train", "HSK 4", "n"],
  "偏要": ["piān yào", "insist on", "HSK 5", "k"],
  "走向": ["zǒu xiàng", "walk toward", "HSK 2", "n"],
  "守": ["shǒu", "keep watch; guard", "HSK 5", "k"],
  "黎明": ["lí míng", "dawn", "HSK 6", "k", 1],
  "真正": ["zhēn zhèng", "true; genuine", "HSK 3", "n"],
  "握紧": ["wò jǐn", "grip tightly", "HSK 5", "k"],
  "天亮": ["tiān liàng", "daybreak", "HSK 3", "n"],
  "广播": ["guǎng bō", "broadcast; announcement", "HSK 5", "k"],
  "第一次": ["dì yī cì", "for the first time", "HSK 2", "n"],
  "报出": ["bào chū", "announce; call out", "HSK 4", "n"],
  "莫名": ["mò míng", "inexplicably", "HSK 6", "k"],
  "熟悉": ["shú xī", "familiar", "HSK 4", "n", 1],
  "名字": ["míng zì", "name", "HSK 2", "n"],
  "怀疑": ["huái yí", "suspect; doubt", "HSK 4", "n"],
  "陷阱": ["xiàn jǐng", "trap", "HSK 6", "k", 1],
  "继续": ["jì xù", "continue", "HSK 3", "n"],
  "回头": ["huí tóu", "turn back; look back", "HSK 3", "n"],
  "竟是": ["jìng shì", "turns out to be", "HSK 4", "n"],
  "另一个": ["lìng yī gè", "another", "HSK 3", "n"],
  "质问": ["zhì wèn", "interrogate; demand", "HSK 6", "k"],
  "为什么": ["wèi shén me", "why", "HSK 1", "n"],
  "偏偏": ["piān piān", "of all things; precisely", "HSK 5", "k"],
  "抢过": ["qiǎng guò", "snatch away", "HSK 4", "n"],
  "猛推": ["měng tuī", "shove hard", "HSK 5", "k"],
  "疯狂": ["fēng kuáng", "wild; crazed", "HSK 5", "k"],
  "加速": ["jiā sù", "accelerate", "HSK 5", "k"],
  "冲进": ["chōng jìn", "charge into", "HSK 4", "n"],
  "惊觉": ["jīng jué", "realize with a start", "HSK 6", "k"],
  "松手": ["sōng shǒu", "let go", "HSK 4", "n"],
  "闭眼": ["bì yǎn", "close one's eyes", "HSK 4", "n"],
  "坠入": ["zhuì rù", "plunge into", "HSK 6", "k", 1],
  "想起": ["xiǎng qǐ", "recall; remember", "HSK 3", "n", 1],
  "牵挂": ["qiān guà", "be concerned about; miss", "HSK 6", "k", 1],
  "等你": ["děng nǐ", "waiting for you", "HSK 2", "n"],
  "家": ["jiā", "home", "HSK 1", "n", 1],
  "念出": ["niàn chū", "read aloud", "HSK 4", "n"],
  "浮现": ["fú xiàn", "surface; emerge", "HSK 6", "k"],
  "晨光": ["chén guāng", "morning light", "HSK 6", "k", 1],
  "照进": ["zhào jìn", "shine in", "HSK 4", "n"],
  "踏出": ["tà chū", "step out", "HSK 5", "k"],
  "茫然": ["máng rán", "blankly; at a loss", "HSK 6", "k"],
  "帽子": ["mào zi", "hat; cap", "HSK 3", "n", 1],
  "戴上": ["dài shàng", "put on", "HSK 3", "n"],
  "接班": ["jiē bān", "take over a shift", "HSK 6", "k", 1],
  "拒绝": ["jù jué", "refuse", "HSK 4", "n"],
  "转身": ["zhuǎn shēn", "turn around", "HSK 3", "n"],
  "坐得": ["zuò de", "have sat", "HSK 2", "n"],
  "太久": ["tài jiǔ", "too long", "HSK 2", "n"],
  "忘了": ["wàng le", "forgot", "HSK 2", "n"],
  "愿意": ["yuàn yì", "be willing", "HSK 3", "n"],
  "__PH__": ["", "", "", ""],
};

const PUNCT = /^[，。！？：；、…—“”‘’""'']+$/u;
const TIER = { n: "normal", k: "key" };

// 估算单个 segment 的朗读时长（毫秒）。标点短，词随字数与是否含引号变长。
function durationOf(word, isBase) {
  if (PUNCT.test(word)) return 150;
  // 含引号的整句对白：按字数粗算，封顶
  const hasQuote = /[“”""]/.test(word);
  const chars = word.replace(/[^一-龥]/g, "").length || 1;
  if (hasQuote) return Math.min(300 + chars * 280, 4500);
  if (isBase) return chars <= 1 ? 200 : 150 + chars * 180;
  return 200 + chars * 180;
}

// 把分词数组编译成 { text_segments, timestamps }
const missing = new Set();
function compile(nodeId, words) {
  const segs = [];
  const ts = [];
  let cursor = 0;
  for (const word of words) {
    const isPunct = PUNCT.test(word);
    const isQuote = /[“”""]/.test(word);
    const dict = DICT[word];
    let seg;
    if (isPunct || isQuote || BASE_WORDS.has(word)) {
      // base：标点/对白/极常见虚词。无 tooltip 字段。
      seg = { word, reading: null, meaning: null, level: null, tier: "base" };
    } else if (dict) {
      const [reading, meaning, level, t, plot] = dict;
      seg = { word, reading, meaning, level, tier: TIER[t] };
      if (plot) seg.isPlotKeyword = true;
    } else {
      missing.add(word);
      seg = { word, reading: "?", meaning: "?", level: "HSK 4", tier: "normal" };
    }
    segs.push(seg);
    const dur = durationOf(word, seg.tier === "base");
    ts.push({ start: cursor, end: cursor + dur });
    cursor += dur;
  }
  return { text_segments: segs, timestamps: ts };
}

// —— 故事节点：每个节点 = 分词数组 words + choices ——
// choices: [文案, 目标节点id]；目标 "END" 自动转为 end_back_to_list 单选结局。
const NODES = {
  start: {
    words: ["末班", "地铁", "缓缓", "进站", "，", "你", "拖着", "疲惫", "的", "身体", "走进", "车厢", "。", "报站声", "忽然", "响起", "，", "那个", "站名", "你", "从来", "没有", "听过", "。", "车厢", "里", "坐满了", "乘客", "，", "却", "安静", "得", "诡异", "。"],
    choices: [
      ["A. 观察周围的乘客", "observe"],
      ["B. 走到角落与老人搭话", "talk_old"],
      ["C. 起身穿过车厢探路", "explore_car"],
    ],
  },
  observe: {
    words: ["你", "悄悄", "打量", "四周", "的", "乘客", "。", "他们", "个个", "低着头", "，", "一动不动", "。", "你", "无意中", "瞥见", "车窗", "的", "倒影", "——", "玻璃", "里", "的", "座位", "竟然", "全是", "空", "的", "。"],
    choices: [
      ["A1. 凑近去看乘客的脸", "see_faces"],
      ["A2. 走向那个注视你的老人", "talk_old"],
    ],
  },
  see_faces: {
    words: ["你", "鼓起", "勇气", "，", "转头", "看向", "身边", "的", "乘客", "。", "那一刻", "，", "你", "浑身", "冰凉", "——", "他们", "全都", "没有", "脸", "，", "只有", "一片", "模糊", "的", "灰白", "。", "一个", "苍老", "的", "声音", "在", "身后", "唤", "你", "。"],
    choices: [
      ["B. 走到老人身边", "talk_old"],
      ["C. 转身逃向车厢深处", "explore_car"],
    ],
  },
  explore_car: {
    words: ["你", "起身", "穿过", "一节节", "车厢", "，", "它们", "越来越", "破旧", "。", "尽头", "是", "一扇", "驾驶室", "的", "铁门", "，", "旁边", "有", "一个", "红色", "的", "制动闸", "。"],
    choices: [
      ["1. 拉下紧急制动闸", "pull_brake"],
      ["2. 推开驾驶室的铁门", "driver_door"],
      ["3. 先回座位观察情况", "observe"],
    ],
  },
  talk_old: {
    words: ["你", "走到", "车厢", "角落", "，", "那里", "坐着", "一位", "白发", "老人", "。", "你", "轻声", "问", "：", "“这趟车开往哪里？”", "老人", "缓缓", "抬起头", "，", "浑浊", "的", "眼睛", "盯着", "你", "，", "低声", "说", "：", "“你不该上这趟车的。”"],
    choices: [
      ["B1. 追问这话是什么意思", "ask_meaning"],
      ["B2. 问他怎样才能下车", "ask_escape"],
    ],
  },
  ask_meaning: {
    words: ["你", "心头", "一紧", "，", "追问", "道", "：", "“您这话是什么意思？”", "老人", "叹了口气", "，", "指向", "窗外", "：", "“这趟末班车，", "永远", "到不了", "终点", "。”", "窗外", "的", "黑暗", "中", "，", "同一个", "站台", "正在", "一遍遍", "地", "重复", "闪过", "。"],
    choices: [
      ["1. 那要怎样才能离开？", "ask_escape"],
      ["2. 我自己去找出路", "explore_car"],
    ],
  },
  ask_escape: {
    words: ["老人", "递给", "你", "一张", "泛黄", "的", "旧", "车票", "，", "压低", "声音", "嘱咐", "：", "“守到黎明，在那唯一一座有名字的真站下车。", "千万", "别", "去碰", "车头", "的", "司机", "。”"],
    choices: [
      ["1. 偏要去车头找司机", "driver_door"],
      ["2. 守到黎明的真站", "wait_dawn"],
    ],
  },
  pull_brake: {
    words: ["你", "猛地", "拉下", "制动闸", "，", "列车", "急刹", "，", "灯光", "剧烈", "闪烁", "。", "车门", "缓缓", "打开", "，", "可", "站牌", "上", "的", "站名", "依旧", "陌生", "。"],
    choices: [
      ["1. 踏上站台看个究竟", "platform"],
      ["2. 留在车上等真站", "wait_dawn"],
    ],
  },
  driver_door: {
    words: ["你", "推开", "驾驶室", "的", "铁门", "。", "司机", "缓缓", "回头", "——", "那张", "脸", "，", "竟是", "另一个", "你", "自己", "。"],
    choices: [
      ["1. 质问“为什么是我”", "confront_driver"],
      ["2. 抢过操纵杆自己来开", "take_controls"],
    ],
  },
  platform: {
    words: ["你", "踏上", "站台", "。", "站台", "尽头", "，", "又是", "一模一样", "的", "一趟", "末班", "地铁", "，", "正", "等着", "你", "。", "手中", "的", "车票", "上", "，", "竟", "缓缓", "浮现", "出", "一个", "站名", "。"],
    choices: [
      ["1. 念出车票上的站名", "read_ticket"],
      ["2. 茫然走向那趟新车", "ending_loop"],
    ],
  },
  wait_dawn: {
    words: ["你", "握紧", "车票", "，", "守到", "天亮", "。", "广播", "第一次", "报出", "一个", "你", "莫名", "熟悉", "的", "真正", "的", "站名", "。"],
    choices: [
      ["1. 就在这一站下车", "read_ticket"],
      ["2. 怀疑是陷阱，继续坐着", "ending_loop"],
    ],
  },
  confront_driver: {
    words: ["“这趟车需要引路人，”", "另一个", "你", "平静", "地", "说", "，", "“你坐得太久，忘了自己是谁。愿意接班吗？”"],
    choices: [
      ["1. 拒绝，转身去等黎明", "wait_dawn"],
      ["2. 接过他的帽子", "ending_conductor"],
    ],
  },
  take_controls: {
    words: ["你", "抢过", "操纵杆", "，", "猛推", "到底", "。", "列车", "疯狂", "加速", "，", "冲进", "无尽", "的", "隧道", "，", "黑暗", "扑面而来", "。"],
    choices: [
      ["1. 惊觉松手，重新急刹", "pull_brake"],
      ["2. 闭眼冲过去", "ending_void"],
    ],
  },
  // —— 结局 ——
  read_ticket: {
    words: ["你", "念出", "那个", "站名", "，", "忽然", "想起", "家", "，", "想起", "那个", "还", "在", "等你", "的", "人", "。", "心底", "的", "牵挂", "让", "车门", "向", "真正", "的", "站台", "打开", "，", "晨光", "照进", "来", "。", "你", "踏出", "车厢", "，", "终于", "回到", "了", "人间", "。"],
    choices: [["[ 返回故事列表 ]", "END"]],
  },
  ending_loop: {
    words: ["你", "低下头", "，", "像", "其他", "乘客", "一样", "陷入", "沉默", "。", "末班", "地铁", "再次", "启动", "，", "载着", "你", "驶入", "永无", "终点", "的", "循环", "。"],
    choices: [["[ 返回故事列表 ]", "END"]],
  },
  ending_conductor: {
    words: ["你", "戴上", "那顶", "帽子", "，", "另一个", "你", "如释重负", "地", "消失", "了", "。", "从此", "，", "你", "成了", "这趟", "末班", "地铁", "新的", "引路人", "。"],
    choices: [["[ 返回故事列表 ]", "END"]],
  },
  ending_void: {
    words: ["列车", "冲入", "无底", "的", "黑暗", "，", "再也", "没有", "停下", "。", "你", "坠入", "了", "一片", "没有", "声音", "的", "虚无", "。"],
    choices: [["[ 返回故事列表 ]", "END"]],
  },
};

// 补充上面用到但未登记的词
Object.assign(DICT, {
  "苍老": ["cāng lǎo", "aged; old", "HSK 6", "k"],
  "身后": ["shēn hòu", "from behind", "HSK 4", "n"],
  "唤": ["huàn", "call (out to)", "HSK 6", "k"],
  "它们": ["tā men", "they (things)", "HSK 2", "n"],
  "列车": ["liè chē", "train", "HSK 5", "k"],
  "剧烈": ["jù liè", "intense; violent", "HSK 5", "k"],
  "可": ["kě", "but; yet", "HSK 2", "n"],
  "那张": ["nà zhāng", "that (flat object)", "HSK 2", "n"],
  "手中": ["shǒu zhōng", "in one's hand", "HSK 3", "n"],
  "竟": ["jìng", "unexpectedly", "HSK 5", "k"],
  "出": ["chū", "emerge; out", "HSK 2", "n"],
  "守到": ["shǒu dào", "keep watch until", "HSK 5", "k"],
  "平静": ["píng jìng", "calm", "HSK 4", "n"],
  "到底": ["dào dǐ", "all the way; to the end", "HSK 4", "n"],
  "无尽": ["wú jìn", "endless", "HSK 6", "k", 1],
  "扑面而来": ["pū miàn ér lái", "rush at one's face", "HSK 7", "k"],
  "人": ["rén", "person", "HSK 1", "n"],
  "心底": ["xīn dǐ", "bottom of one's heart", "HSK 5", "k"],
  "来": ["lái", "(directional) come", "HSK 1", "n"],
  "人间": ["rén jiān", "the human world", "HSK 6", "k", 1],
  "低下头": ["dī xià tóu", "lower one's head", "HSK 3", "n"],
  "像": ["xiàng", "like; as", "HSK 2", "n"],
  "其他": ["qí tā", "other", "HSK 3", "n"],
  "一样": ["yī yàng", "the same", "HSK 3", "n"],
  "陷入": ["xiàn rù", "sink into", "HSK 5", "k"],
  "沉默": ["chén mò", "silence", "HSK 5", "k", 1],
  "再次": ["zài cì", "once again", "HSK 4", "n"],
  "启动": ["qǐ dòng", "start up", "HSK 5", "k"],
  "载着": ["zài zhe", "carrying", "HSK 5", "k"],
  "驶入": ["shǐ rù", "drive into", "HSK 6", "k"],
  "永无": ["yǒng wú", "never", "HSK 5", "k"],
  "那顶": ["nà dǐng", "that (for hats)", "HSK 3", "n"],
  "如释重负": ["rú shì zhòng fù", "as if relieved of a burden", "HSK 7", "k"],
  "消失": ["xiāo shī", "vanish", "HSK 4", "n"],
  "从此": ["cóng cǐ", "from then on", "HSK 4", "n"],
  "成了": ["chéng le", "became", "HSK 2", "n"],
  "这趟": ["zhè tàng", "this (trip)", "HSK 4", "n"],
  "新的": ["xīn de", "new", "HSK 1", "n"],
  "冲入": ["chōng rù", "charge into", "HSK 4", "n"],
  "无底": ["wú dǐ", "bottomless", "HSK 6", "k"],
  "再也": ["zài yě", "(not) ever again", "HSK 3", "n"],
  "停下": ["tíng xià", "stop", "HSK 2", "n"],
  "虚无": ["xū wú", "nothingness; void", "HSK 7", "k", 1],
  "一个": ["yī gè", "one; a", "HSK 1", "n"],
  "有": ["yǒu", "there is; have", "HSK 1", "n"],
  "地": ["de", "(adverbial particle)", "HSK 2", "n"],
  "又是": ["yòu shì", "is yet again", "HSK 2", "n"],
  "一趟": ["yī tàng", "one (trip)", "HSK 4", "n"],
});

// —— 编译并写出 ——
const nodes = {};
for (const [id, def] of Object.entries(NODES)) {
  const { text_segments, timestamps } = compile(id, def.words);
  const choices = def.choices.map(([text, target]) => ({
    text,
    next_node_id: target === "END" ? "end_back_to_list" : target,
  }));
  nodes[id] = { bg_image: null, audio_url: null, text_segments, timestamps, choices };
}

const story = {
  story_id: "last-train",
  target_lang: "zh",
  gloss_lang: "en",
  title_cn: "末班地铁",
  title_en: "The Last Train",
  level: "HSK 4",
  level_system: "HSK",
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
// 可达性
const reach = new Set(["start"]); let ch = true;
while (ch) { ch = false; for (const id of [...reach]) for (const c of nodes[id].choices)
  if (ids.has(c.next_node_id) && !reach.has(c.next_node_id)) { reach.add(c.next_node_id); ch = true; } }
for (const id of ids) if (!reach.has(id)) { console.error(`✗ 孤立节点: ${id}`); ok = false; }

if (!ok) { console.error("校验失败，未写出。"); process.exit(1); }
if (missing.size) {
  console.error("✗ 以下词缺词典定义（暂用占位）：\n" + [...missing].map((w) => `  "${w}"`).join("\n"));
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(story, null, 2) + "\n");
console.log(`✓ 写出 ${OUT}（${ids.size} 节点，全部校验通过）`);

export {};
