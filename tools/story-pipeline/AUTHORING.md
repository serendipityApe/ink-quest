# Agent 创作指南：故事草稿（draft）

> 本项目的"LLM 创作"不接外部 SDK，而是由 **agent（如 Claude/Ducc）在本地直接创作**。
> agent 读本指南 → 写草稿 JSON → 跑工具富化 → 审校释义 → 组装入库。

## 为什么不接 LLM API

- 创作是低频、人在环节的操作（不是线上实时），agent 本地写文件即可；
- 省掉 SDK/密钥/计费/重试等工程负担；
- agent 能边写边参考词库输出、即时校验，迭代更快。

## 完整流程（4 步）

```
① agent 创作草稿     →  tools/story-pipeline/drafts/<id>.draft.json
② 工具富化           →  tsx src/cli/enrich-draft.ts drafts/<id>.draft.json
                        产出 build/<id>.enriched.json（分词/读音/分级/tier 已填，meaning 预填）
③ agent 审校释义     →  打开 enriched.json，按上下文从 candidates 选/改写每个 meaning
④ 工具组装入库       →  tsx src/cli/assemble-story.ts build/<id>.enriched.json --write
                        校验 + 估时 + 写 src/data/stories/<target>/<id>.json
⑤ 人工登记           →  registry.ts (LOADERS+CATALOG) + storyMaps.ts（手动，见 PROJECT_OVERVIEW §8）
```

## ① 草稿格式（agent 直接写）

`drafts/<id>.draft.json`：只写剧情，**不要碰分词/读音/释义/时间戳**（那些是②自动填的）。

```jsonc
{
  "story_id": "old-house-letter",        // kebab-case，全局唯一
  "target_lang": "zh",                   // 学哪门语言（正文语言）：zh | en
  "gloss_lang": "en",                    // 释义语言：zh学英文→"zh"，en学中文→... 实际取反
  "title_cn": "老宅的信",
  "title_en": "The Old House Letter",
  "level": "HSK 4",                      // 中文用 HSK 1-9，英文用 CEFR A1-C2
  "level_system": "HSK",                 // "HSK" | "CEFR"
  "nodes": {
    "start": {
      "text": "你推开门，看见桌上有一封信。",   // 纯正文，目标语，不分词
      "plotWords": ["信"],                      // 剧情关键词（可选）→ 强制高亮 key
      "choices": [
        { "text": "A. 拆开信", "next_node_id": "open" },
        { "text": "B. 转身离开", "next_node_id": "leave" }
      ]
    },
    "open": {
      "text": "信里写着一行字……",
      "choices": [{ "text": "[ 返回故事库 ]", "next_node_id": "end_back_to_list" }]
    }
    // ...
  }
}
```

### 对照表：target_lang / gloss_lang
| 学什么 | target_lang | gloss_lang | level_system | 正文 | 释义 |
|--------|-------------|------------|--------------|------|------|
| 学中文 | `zh` | `en` | `HSK` | 中文 | 英文 |
| 学英文 | `en` | `zh` | `CEFR` | 英文 | 中文 |

### 剧情结构要求（沿用现有设计）
- 1 个 `start` + 多个分支，分支可汇合，**避免一步到死路**；
- 结局节点：`choices` 全部指向保留 id `"end_back_to_list"`；
- `next_node_id` 必须命中真实节点（②③④会校验，断链会报错）；
- 每节点正文 2~5 句，难度贴合 `level`。

## ③ 审校释义（agent 的核心判断活）

打开 `build/<id>.enriched.json`，每个非 base 的 token 形如：

```jsonc
{
  "word": "信",
  "reading": "xìn",
  "level": "HSK 3",
  "tier": "key",
  "isPlotKeyword": true,
  "candidates": ["letter", "mail", "to believe", "trust", "...词典所有义项"],
  "meaning": "letter"   // ← enrich 预填了候选首项，agent 按上下文确认/改写
}
```

agent 要做的：
1. **按上下文选对义项**——"信"在"一封信"里是 letter，不是 believe；词典候选常有多义，预填的不一定对。
2. **压简**——释义控制在一个简短短语，适合学习者速读（别整段词典释义）。
3. **只改 `meaning`**，不要动 reading/level/tier/word（那些是确定性的）。
4. `candidates` 字段 assemble 时会丢弃，仅供你参考。

## ④ 组装

```bash
# 先 dry-run 看校验
tsx src/cli/assemble-story.ts build/<id>.enriched.json
# 通过后写盘
tsx src/cli/assemble-story.ts build/<id>.enriched.json --write
```

时间戳此阶段是**估算**（P3 接腾讯云/海外 TTS 后换成真实词级对齐 + 音频）。

## 注意

- `drafts/`、`build/` 是工作目录，gitignore（产物入库的是 `src/data/stories/`）。
- 多音字/分词/分级交给工具，agent **不要手填** reading/level——那是富化层的确定性职责。
- 登记到 registry 是**手动**确认点（防脚本改源码出错 + 内容审核）。
