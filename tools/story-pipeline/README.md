# @inkquest/story-pipeline

故事生成工作流（独立 workspace 工具，**不进 web app bundle**）。
设计见 `docs/story-generation-pipeline.md`。

## 这是什么

把"一句话设定"变成符合 web app schema 的完整故事 JSON：
LLM 写剧情 → 富化层机械填充（分词/读音/释义候选/分级）→ LLM 消歧 → TTS 真音频+词级时间戳 → 校验入库。

当前已实现本地创作管线，以及云端文字生成、Azure Speech / 腾讯云 TTS、私有音频上传和分项积分结算。

## 云端 Worker

```bash
pnpm --filter @inkquest/story-pipeline worker:build
pnpm --filter @inkquest/story-pipeline worker:start
```

Worker 暴露 `GET /health` 和受 Bearer token 保护的 `POST /jobs/:jobId`。它通过 Supabase RPC claim 任务，按 `LLM_PROVIDER` 选择 OpenAI Responses API 或原有 OpenAI-compatible chat-completions 接口，生成结构化规划与正文，复用本包富化层。正文先独立提交；开启 TTS 时再合成、用 FFmpeg 规范化多段 MP3、上传 Supabase Storage，并单独结算语音积分。语音最终失败只退还 TTS 积分，不回滚正文。

环境变量：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GENERATION_WORKER_TOKEN
LLM_PROVIDER
OPENAI_API_KEY
OPENAI_KEY
OPENAI_MODEL
OPENAI_ORG_ID
OPENAI_PROJECT_ID
OPENAI_MAX_OUTPUT_TOKENS
OPENAI_REASONING_EFFORT
LLM_CHAT_COMPLETIONS_URL
LLM_API_KEY
LLM_MODEL
LLM_PROMPT_VERSION
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
TENCENT_REGION
TENCENT_TTS_VOICE
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
AZURE_TTS_VOICE_ZH
AZURE_TTS_VOICE_EN
STORY_TTS_ZH_PROVIDER
STORY_TTS_EN_PROVIDER
GENERATED_AUDIO_BUCKET
PORT
```

容器入口见 `Dockerfile`。`data/` 中的词典仍是可选部署资产；缺失时会降级为分词和读音能力，释义由模型补齐。

## LLM 提供方与 OpenAI 额度

切换的是 **story-pipeline Worker**，不是 Next.js 浏览器端或本地 agent 创作流。配置示例见 [`llm.env.example`](llm.env.example)；示例不会被自动加载，不含凭据。

| 变量 | 含义 |
| --- | --- |
| `LLM_PROVIDER` | `openai`、`gemini` 或 `chat-completions`；未设置时保留原 Chat Completions 行为，即使存在 OpenAI key 也不自动切换 |
| `OPENAI_API_KEY` / `OPENAI_KEY` | OpenAI 模式二者至少配置一个；非空 `OPENAI_API_KEY` 优先，否则使用 `OPENAI_KEY`。通过本机私有环境文件或部署平台的 secret 安全配置 |
| `OPENAI_MODEL` | OpenAI 模式必填；选择 interview 组织／项目有权限使用且支持 Responses 和 JSON mode 的模型，无隐式默认型号 |
| `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID` | 可选的实际组织／项目 ID，发送为 `OpenAI-Organization` / `OpenAI-Project` 请求头；不能填写显示名称 `interview` |
| `OPENAI_MAX_OUTPUT_TOKENS` | 正整数，默认 6000，包含模型推理与文本输出预算；截断会报错，需评估后调高 |
| `OPENAI_REASONING_EFFORT` | 可选 `none`、`low`、`medium`、`high`、`xhigh`、`max`；仅向 OpenAI 发送，须与所选模型兼容；未设置则使用模型默认值 |
| `LLM_PROMPT_VERSION` | 两种提供方共用，默认 `opening-v1` |
| `LLM_CHAT_COMPLETIONS_URL` / `LLM_API_KEY` / `LLM_MODEL` | 原 Gemini／兼容接口配置，仅用于 `gemini` 和 `chat-completions` 模式 |

OpenAI 固定调用官方 `https://api.openai.com/v1/responses`，不会把 OpenAI key 发往旧 Gemini endpoint。规划、正文及释义复用同一套提示和运行时字段校验；开放式世界设定／剧情状态沿用 JSON mode，并未宣称 JSON Schema 严格约束。当前流程是后台任务，仍一次性返回结果，没有新增浏览器流式协议。请求设 `store: false`，不创建服务端对话状态；这不代表零数据保留。结果元数据记录提供方与模型。限流／服务故障最多请求三次；认证、额度耗尽、拒绝及输出截断不会盲目重试，也不会自动向另一家发送内容。

**额度归属需单独核实**：用户收到的邮件称 interview 组织于 2026-10-29 获赠 $46、于 2026-11-12 到期；本次未核实当前余额、资格或模型适用范围。必须在 OpenAI Platform 切到 **interview**，核对 Billing/Credit grants 的余额、有效期和条款，并安全使用该组织下对应项目可用的 API key。任意 OpenAI key 或仅填写组织请求头都不保证能抵扣该额度。

安全配置后，将 Worker 的 `LLM_PROVIDER=openai`；保留 Gemini 的三个 `LLM_*` 变量。需要回退时改为 `LLM_PROVIDER=gemini` 并重启本地 Worker（云端需另行授权部署）。不要把 key 放到 `NEXT_PUBLIC_*`、代码、聊天或示例文件中。代码不修改真实凭据，也不自动切换已运行的 Worker。`.env` 中的 `OPENAI_KEY` 会由现有加载器读入内存，无需重命名或复制；仍需显式设置提供方、模型和所需推理强度。

本地离线验证（mock fetch，不消耗额度）：

```bash
pnpm --filter @inkquest/story-pipeline test:llm
pnpm --filter @inkquest/story-pipeline typecheck
pnpm --filter @inkquest/story-pipeline worker:build
```

API 用法依据：[Responses 迁移指南](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[JSON mode](https://developers.openai.com/api/docs/guides/structured-outputs)、[组织／项目鉴权](https://developers.openai.com/api/reference/overview)。

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
| `data/cedict_ts.u8` | 中→英释义候选 | [CC-CEDICT](https://cc-cedict.org/wiki/) (CC-BY-SA) |
| `data/ecdict.csv` | 英→中释义 + CEFR/词频 | ECDICT |
| `data/hsk30.json` | 中文 HSK 3.0 分级 | [2026 HSK 词表数据](https://github.com/profesorm/hsk30) (CC BY 4.0，源自 Chinese Testing International 考试大纲) |

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
- 配了 Azure Speech 的密钥和区域（env）→ 真实 MP3 + Azure WordBoundary 词级对齐；
- 未配置 Azure 但配置了腾讯云密钥 → 使用腾讯云；
- 未配置 / `--no-audio` → 降级为估时，不产音频（CI/本地友好）。

Azure Speech 环境变量（密钥不入仓；本项目验证资源位于 `eastasia`）：
```bash
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastasia
AZURE_TTS_VOICE_ZH=zh-CN-Xiaoxiao:DragonHDFlashLatestNeural  # 可选，默认即此音色
AZURE_TTS_VOICE_EN=en-US-JennyNeural      # 可选，默认即此音色
```
Azure 和腾讯云同时配置时，默认优先 Azure。可按语言设置 `STORY_TTS_ZH_PROVIDER=azure`、`STORY_TTS_EN_PROVIDER=azure`（或 `tencent`）来固定供应商。Worker 的运行环境也必须配置 Azure 密钥与区域；仅在本地 `.env.local` 配置不会影响已部署的 Worker。Azure 的字符位置映射到 InkQuest 原有分词；若有非标点词缺少词边界，任务会按现有 TTS 重试机制处理，不会发布虚构时间戳。

中文 `reading` 是阅读器展示的拼音，目前不会传给 Azure TTS；合成器直接朗读正文，可能误读多音字。发布前应试听并改写有歧义的句子。若必须保留原字形，需另行实现 SSML `<phoneme>` 指定读音，并验证词边界对齐。

腾讯云环境变量（不入仓）：
```bash
TENCENT_SECRET_ID=...
TENCENT_SECRET_KEY=...
TENCENT_REGION=ap-guangzhou        # 可选
TENCENT_TTS_VOICE=101001           # 可选，需选支持时间戳的音色
```
`story-pipeline` 启动时会自动读取仓库根 `.env` / `.env.local`，也支持 `tools/story-pipeline/.env` / `.env.local`。shell 里已经手动 export 的同名变量优先级最高。
英文（`target_lang: en`）同样可使用 Azure Speech 的词边界。

## 进度

- [x] P1 富化层（zh: jieba+pinyin-pro+CC-CEDICT+HSK；en: Intl.Segmenter+ECDICT）+ 校验抽离
- [x] P2 agent 创作流（draft → enrich → 审校 → assemble），端到端验证通过
- [x] P3 腾讯云 TTS（TC3 签名 + 字符级→词级聚合 + 分块拼接）+ 降级估时
- [x] P3.5 Azure Speech 中英文 TTS（MP3 + WordBoundary 对齐）
- [ ] P4 量产首发内容
