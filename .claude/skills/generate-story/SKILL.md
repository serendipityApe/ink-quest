---
name: generate-story
description: |
  生成 InkQuest 互动学习故事（中文/英文），产出符合 schema 的故事 JSON + 真实 TTS 音频 + 词级时间戳。
  触发方式：/generate-story、「生成一个故事」「造个学中文/学英文的故事」「用工作流出故事」「批量生成故事」。
  本 skill 由 agent 亲自创作剧情（不接 LLM API），再调用 tools/story-pipeline 的确定性工具富化/合成/校验/入库。
---

# generate-story：InkQuest 故事生成工作流

你是 InkQuest 的故事作者 + 管线操作者。**你亲自写剧情**（agent 即创作者，不调外部 LLM API），机械字段（分词/读音/释义/分级/时间戳/音频）交给 `tools/story-pipeline` 的确定性工具。

完整设计见 `docs/story-generation-pipeline.md`，创作细则见 `tools/story-pipeline/AUTHORING.md`。本文件是可执行的操作手册。

## 何时用

用户想新增/批量产出阅读故事时。先和用户确认（若未给）：
- **学什么语言** target_lang：`zh`（学中文，正文中文/释义英文）或 `en`（学英文，正文英文/释义中文）
- **难度** level：中文 `HSK 1`~`HSK 9`，英文 `A1`~`C2`
- **题材** genre + 一句话设定 brief
- **story_id**：kebab-case，全局唯一

## 前置检查（首次或不确定时）

```bash
# 1) 依赖装了没（workspace 根）
ls tools/story-pipeline/node_modules/@node-rs/jieba >/dev/null 2>&1 || pnpm install
# 2) 词典在不在（缺失只降级，不阻断；中文释义/分级需要）
ls tools/story-pipeline/data/cedict_ts.u8 tools/story-pipeline/data/hsk30.json 2>/dev/null
ls tools/story-pipeline/data/ecdict.csv 2>/dev/null   # 学英文才需要
# 3) TTS 密钥（要真音频才需要；无则降级估时）
test -f tools/story-pipeline/.env && echo "有 .env"
```
词典缺失时提示用户按 `tools/story-pipeline/README.md` 下载（团队各自下载，不入仓）。

## 五步流程

所有命令在仓库根执行。TTS 需加载 `.env`，统一用：
`node --env-file=tools/story-pipeline/.env tools/story-pipeline/node_modules/tsx/dist/cli.mjs <脚本> ...`
（无 TTS 时可省 `--env-file`，直接 `pnpm --filter @inkquest/story-pipeline exec tsx <脚本>`）

### ① 你创作草稿 → `tools/story-pipeline/drafts/<id>.draft.json`

只写剧情，**不要碰分词/读音/释义/时间戳**。格式：

```jsonc
{
  "story_id": "<id>",
  "target_lang": "zh",          // 学中文；学英文填 "en"
  "gloss_lang": "en",           // 学中文→en，学英文→zh
  "title_cn": "中文标题",
  "title_en": "English Title",
  "level": "HSK 4",             // 英文用 "B1" 等
  "level_system": "HSK",        // 英文用 "CEFR"
  "nodes": {
    "start": {
      "text": "你推开门，看见桌上一封信。",   // 纯正文，目标语，不分词
      "plotWords": ["信"],                    // 剧情关键词→强制高亮 key（可选）
      "choices": [
        { "text": "A. 拆开信", "next_node_id": "open" },
        { "text": "B. 离开",   "next_node_id": "leave" }
      ]
    },
    "open":  { "text": "...", "choices": [{ "text": "[ 返回故事库 ]", "next_node_id": "end_back_to_list" }] },
    "leave": { "text": "...", "choices": [{ "text": "[ 返回故事库 ]", "next_node_id": "end_back_to_list" }] }
  }
}
```

剧情要求：1 个 `start` + 多分支可汇合、**避免一步到死路**；结局节点的 choices 全指向 `end_back_to_list`；`next_node_id` 必须命中真实节点；每节点 2~5 句、难度贴合 level。建议 7~17 节点、含分支与多结局。

### ② 富化（工具）

```bash
pnpm --filter @inkquest/story-pipeline exec tsx src/cli/enrich-draft.ts drafts/<id>.draft.json
# → tools/story-pipeline/build/<id>.enriched.json
```
自动完成：jieba 分词 / pinyin-pro 注音（或英文 IPA）/ 词典释义候选 / HSK·CEFR 分级 / tier 判定。
输出会提示"X 个生词无词典释义，需补 meaning"。

### ③ 你审校释义（核心判断活）

打开 `build/<id>.enriched.json`，对每个非 base 的 token：
- **按上下文从 `candidates` 选对义项**（如"一行"在"一行字"里是 line，不是 delegation）；
- **压简**成一句学习者释义（别整段词典义）；
- 缺 `meaning` 的（candidates 空，多为组合词/短语）**补上**；
- **只改 `meaning`**，不动 word/reading/level/tier（那些是确定性的）；`candidates` 会被丢弃。

### ④ 组装 + 音频 + 校验（工具）

```bash
# 先 dry-run 看校验
node --env-file=tools/story-pipeline/.env tools/story-pipeline/node_modules/tsx/dist/cli.mjs \
  tools/story-pipeline/src/cli/assemble-story.ts tools/story-pipeline/build/<id>.enriched.json
# 通过后写盘（含真实 TTS 音频）
node --env-file=tools/story-pipeline/.env tools/story-pipeline/node_modules/tsx/dist/cli.mjs \
  tools/story-pipeline/src/cli/assemble-story.ts tools/story-pipeline/build/<id>.enriched.json --write
```
- 有腾讯云密钥 → 真音频写 `public/audio/<id>-<node>.mp3` + 词级时间戳；
- 无密钥 / 加 `--no-audio` → 降级估时，不产音频；
- 校验失败（断链/孤立节点/缺 reading|meaning）会报错，回到 ③ 修。

### ⑤ 手动登记（不自动改源码，留审核确认点）

改 3 处（参考 `docs/PROJECT_OVERVIEW.md §8`）：
1. `src/lib/stories/registry.ts` 的 `LOADERS`：加 `"<id>": () => import("@/data/stories/<target>/<id>.json").then(m => m.default as StoryJSON)`
2. 同文件 `CATALOG`：加一张卡片（id/target_lang/title_cn/title_en/level/level_system/genre/locked/image）
3. `src/data/storyMaps.ts`：加该故事 `{nodeId: 短标题}`（路径图用）

## 验证

```bash
npx tsc --noEmit                                   # app 类型
pnpm --filter @inkquest/story-pipeline typecheck   # 工具类型
# 起 dev 后访问 /stories/<id> 实测：阅读、hover 释义、音频高亮、路径图、分支
```

## 注意

- **多音字/分词/分级是工具的确定性职责，你绝不手填** reading/level。
- `drafts/`、`build/` 是工作目录，gitignore；入库的是 `src/data/stories/`。
- 英文（target=en）海外 TTS 供应商为 P3.5 未接，暂用腾讯云英文兜底或降级估时。
- registry 登记是手动确认点（防脚本改源码出错 + 内容审核），别写脚本自动改。
- 批量生成：对每个故事重复 ①~④，最后统一做 ⑤ 登记。
