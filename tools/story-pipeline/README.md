# @inkquest/story-pipeline

故事生成工作流（独立 workspace 工具，**不进 web app bundle**）。
设计见 `docs/story-generation-pipeline.md`。

## 这是什么

把"一句话设定"变成符合 web app schema 的完整故事 JSON：
LLM 写剧情 → 富化层机械填充（分词/读音/释义候选/分级）→ LLM 消歧 → TTS 真音频+词级时间戳 → 校验入库。

当前已实现 **P1：富化层（enrich）**。

## 安装

在仓库根运行（pnpm workspace）：

```bash
pnpm install
```

`@node-rs/jieba` 是预编译 Rust 二进制，无需本地编译。

## 离线词典/词表（可选，放 `data/`）

富化层在缺失词典时**自动降级**（仍能分词+拼音，但 candidates/level 为空）。
完整能力需放入：

| 文件 | 用途 | 来源 |
|------|------|------|
| `data/cedict_ts.u8` | 中→英释义候选 | CC-CEDICT (CC-BY-SA) |
| `data/ecdict.csv` | 英→中释义 + CEFR/词频 | ECDICT |
| `data/hsk30.json` | 中文 HSK 3.0 分级 | HSK 3.0 词表 |

`data/` 已 gitignore（大文件，用 LFS 或本地放置）。

## 自检富化层

```bash
pnpm --filter @inkquest/story-pipeline enrich:demo
# 或指定句子
pnpm --filter @inkquest/story-pipeline exec tsx src/cli/enrich-demo.ts zh "你推开房门。"
pnpm --filter @inkquest/story-pipeline exec tsx src/cli/enrich-demo.ts en "An abandoned mansion."
```

## 完整管线（agent 创作流）

见 `AUTHORING.md`。简述：

```
① agent 写草稿        drafts/<id>.draft.json（纯剧情）
② tsx src/cli/enrich-draft.ts drafts/<id>.draft.json
                      → build/<id>.enriched.json（分词/读音/分级/tier 自动填）
③ agent 审校 meaning  按上下文从 candidates 选/改写
④ tsx src/cli/assemble-story.ts build/<id>.enriched.json [--write] [--no-audio]
                      → 校验 + 音频/时间戳 + 写 src/data/stories/<target>/<id>.json
⑤ 手动登记 registry.ts + storyMaps.ts
```

## TTS（P3）

`assemble-story` 第④步自动产音频 + 词级时间戳：
- 配了腾讯云密钥（env）→ 真实音频 + 词级对齐；
- 未配置 / `--no-audio` → 降级为估时，不产音频（CI/本地友好）。

腾讯云环境变量（不入仓）：
```bash
export TENCENT_SECRET_ID=...
export TENCENT_SECRET_KEY=...
export TENCENT_REGION=ap-guangzhou        # 可选
export TENCENT_TTS_VOICE=101001           # 可选，需选支持时间戳的音色
```
英文（`target_lang: en`）海外供应商（Azure/ElevenLabs）为 P3.5，接口已留 `getTtsProvider`。

## 进度

- [x] P1 富化层（zh: jieba+pinyin-pro+CC-CEDICT+HSK；en: Intl.Segmenter+ECDICT）+ 校验抽离
- [x] P2 agent 创作流（draft → enrich → 审校 → assemble），端到端验证通过
- [x] P3 腾讯云 TTS（TC3 签名 + 字符级→词级聚合 + 分块拼接）+ 降级估时；英文海外供应商待接（P3.5）
- [ ] P4 量产首发内容

