# CyberMandarin 副本生成 Prompt

把下面 **「PROMPT 正文」** 整段复制给 AI（Claude / GPT 等），按需替换 `<<...>>` 占位符，即可生成一个可直接落地为 `src/data/<story-id>.json` 的完整互动副本。

生成后的落地步骤见文末「集成清单」。

---

## 数据结构速览

阅读器（`src/app/stories/[id]/page.tsx`）消费的是 `StoryJSON` 结构（定义见 `src/types/story.ts`）。一个副本 = 一个 JSON 文件，包含若干 **节点（node）**，节点之间通过选项跳转，形成分支树。

```
StoryJSON
├─ story_id          故事唯一 id（kebab-case，需与文件名一致）
├─ title_cn          中文标题
├─ title_en          英文标题
├─ level             整体 HSK 难度（如 "HSK 4"）
└─ nodes             Record<nodeId, StoryNodeJSON>
   └─ <nodeId>
      ├─ bg_image       背景图 URL，没有就 null
      ├─ audio_url      旁白音频 URL，没有就 null（无音频时前端用 TTS 兜底）
      ├─ text_segments  TextSegment[]  —— 正文，逐词切分
      ├─ timestamps     Timestamp[]    —— 与 text_segments 一一对应（数量必须相等）
      └─ choices        StoryChoice[]  —— 该节点的分支选项
```

### TextSegment（逐词切分的核心）

```ts
{
  word: string;                 // 这一段文字（一个词 / 一个标点 / 一段引号对白）
  pinyin: string | null;        // 拼音（带声调），标点为 null
  meaning: string | null;       // 英文释义，标点为 null
  level: HskLevel | null;       // "HSK 1"~"HSK 9"，标点为 null
  tier: "base" | "normal" | "key";  // 高亮层级，见下
  isPlotKeyword?: boolean;      // 是否剧情关键词（可选）
}
```

**tier 规则（决定前端交互）：**

| tier | 用于 | 视觉/交互 |
|------|------|-----------|
| `base` | 标点、`你/的/在/了` 等 HSK1~2 极常见虚词、对白引号整句 | 不高亮、不可 hover、无 tooltip |
| `normal` | 一般生词（多为 HSK 2~4） | 下划线动画，hover 700ms 后出 tooltip |
| `key` | 重点/高级词（多为 HSK 5+）、剧情关键词 | 实心高亮，hover 立即出 tooltip |

经验对应（非硬性）：HSK1~2 → `base`，HSK2~4 → `normal`，HSK5+ → `key`。剧情关键词无论级别一般给 `key` 并标 `isPlotKeyword: true`。

### Timestamp（音频/朗读高亮同步）

```ts
{ start: number; end: number }   // 单位：毫秒
```

- `timestamps[i]` 对应 `text_segments[i]`，**数组长度必须严格相等**。
- 必须单调递增、首尾相接：`timestamps[i].end === timestamps[i+1].start`，第 0 个 `start: 0`。
- 时长按朗读节奏估算：单字 ~150–300ms，双字词 ~300–450ms，长词/对白更长，标点 ~150ms。

### StoryChoice（分支）

```ts
{
  text: string;          // 选项文案，建议格式 "A. xxx" / "A1. xxx [Premium]"
  next_node_id: string;  // 跳转到的节点 id；结局用 "end_back_to_list"
  premium?: boolean;     // true = 付费选项，点击弹订阅框，不跳转
}
```

- `next_node_id` 必须指向 `nodes` 中真实存在的 key，**否则断链**。
- `"end_back_to_list"` 是保留 id，表示结局（返回故事列表），无需建对应节点。
- `premium: true` 的选项 `next_node_id` 可随意填（点击不会跳转），文案末尾加 ` [Premium]`。

---

## PROMPT 正文（复制以下整段给 AI）

````
你是中文分级阅读互动小说的内容作者。请为「CyberMandarin」（通过沉浸式互动网文学习地道中文）创作一个完整副本，并输出**一个 JSON 文件**，严格符合下面的 schema 与全部硬性规则。

# 选题
- 题材：<<例如：仙侠 / 赛博朋克 / 都市怪谈 / 科幻 / 历史>>
- 中文标题：<<title_cn>>
- 英文标题：<<title_en>>
- story_id（kebab-case，英文）：<<story-id>>
- 目标 HSK 难度：<<例如 HSK 4>>（正文用词以该级别为主，可少量高于此级别作为 key 生词）

# 结构要求
- 1 个 start 节点 + 3 个一级分支 + 每个一级分支下 2~3 个二级节点，二级节点多为结局（choices 指向 "end_back_to_list"）。总计约 7~10 个节点。
- 每条分支至少有 1 个标 [Premium] 的付费选项（premium: true），用于卡在剧情高潮处。
- 每个节点正文 2~5 句，约 40~120 字，剧情连贯、有钩子。

# JSON Schema
{
  "story_id": string,
  "title_cn": string,
  "title_en": string,
  "level": "HSK 1".."HSK 9",
  "nodes": {
    "<nodeId>": {
      "bg_image": null,
      "audio_url": null,
      "text_segments": [
        { "word": string, "pinyin": string|null, "meaning": string|null,
          "level": "HSK 1".."HSK 9"|null, "tier": "base"|"normal"|"key",
          "isPlotKeyword": true (可选) }
      ],
      "timestamps": [ { "start": number, "end": number } ],
      "choices": [
        { "text": string, "next_node_id": string, "premium": true (可选) }
      ]
    }
  }
}

# 硬性规则（务必全部满足）
1. text_segments 逐词切分：把整句正文拆成「词 / 标点 / 整句引号对白」。所有 word 顺序拼接后 = 完整原文（含标点），不得多字漏字。
2. 标点（，。！？：等）和引号包裹的整段对白，作为独立 segment，其 pinyin / meaning / level 均为 null，tier 为 "base"。
3. tier 判定：
   - base：标点、对白整句、以及「你/的/了/在/着/中/上」等 HSK1~2 极常见虚词；
   - normal：一般生词，多为 HSK2~4；
   - key：HSK5 及以上的高级词，或剧情关键词。
4. 凡 tier 为 normal / key 的 segment，pinyin（带声调）、meaning（简洁英文释义）、level 三者都必须填，不得为 null。
5. 剧情关键词（推动情节的名词/概念）设 tier:"key" 且 "isPlotKeyword": true。
6. timestamps 数组长度必须与 text_segments 完全相等，一一对应；start/end 单位毫秒，从 0 开始，单调递增且首尾相接（前一个 end == 后一个 start）。时长按朗读节奏估算：单字150-300ms、双字词300-450ms、长词/对白更长、标点约150ms。
7. choices 的 next_node_id 必须指向真实存在的节点 key；结局节点用 "end_back_to_list"（保留 id，不需为它建节点）。
8. 不要产生孤立节点（除 start 外每个节点都要能被某个 choice 到达），不要断链。
9. 所有节点的 bg_image 与 audio_url 一律填 null。
10. 选项文案建议：一级用 "A." "B." "C."，二级用 "A1." "A2." 等；付费选项文案末尾加 " [Premium]" 并设 premium:true。

# 输出
只输出最终 JSON，不要任何额外解释或 markdown 代码块外的文字。先在心里自检规则 1、4、6、7 是否全部满足，再输出。
````

---

## 集成清单（拿到 AI 输出的 JSON 后）

1. 保存为 `src/data/<story-id>.json`（文件名与 `story_id` 一致）。
2. 在 `src/app/stories/[id]/page.tsx` 的 `STRUCTURED` 注册表里加一行：
   ```ts
   const STRUCTURED: Record<string, () => Promise<StoryJSON>> = {
     "master-secret": () => import("@/data/master-secret.json").then((m) => m.default as StoryJSON),
     "<story-id>": () => import("@/data/<story-id>.json").then((m) => m.default as StoryJSON),
   };
   ```
3. 在 `src/data/stories.ts` 的 `STORIES` 数组里加一张卡片（`id`、`titleCn`、`titleEn`、`level`、`genre`、`image`、`locked` 等），让它出现在列表页 / 首页。
4. 校验：`text_segments.length === timestamps.length`、所有 `next_node_id` 都能命中（除 `end_back_to_list`）。可临时跑一段 node 脚本断言。
5. 启动 `pnpm dev`，访问 `/stories/<story-id>` 实测分支跳转、hover tooltip、音频/TTS 高亮。

---

## 校验脚本（可选，快速查断链与对齐）

```js
// node check-story.js src/data/<story-id>.json
const story = require(process.argv[2]);
let ok = true;
for (const [id, n] of Object.entries(story.nodes)) {
  if (n.text_segments.length !== n.timestamps.length) {
    console.error(`✗ ${id}: segments(${n.text_segments.length}) != timestamps(${n.timestamps.length})`);
    ok = false;
  }
  for (const c of n.choices) {
    if (c.next_node_id !== "end_back_to_list" && !story.nodes[c.next_node_id]) {
      console.error(`✗ ${id}: 断链 -> ${c.next_node_id}`);
      ok = false;
    }
  }
}
console.log(ok ? "✓ 校验通过" : "✗ 存在问题");
```
