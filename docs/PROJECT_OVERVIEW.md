# CyberMandarin — 项目总览（给后续 AI 的快速上手文档）

> 沉浸式互动网文语言学习 Web 应用。读者在分支剧情中做选择，hover 生词看读音/释义，听旁白朗读高亮，付费解锁高级分支。**支持多语言学习**：学中文（正文中文、释义英文）与学英文（正文英文、释义中文）是两套完全独立的故事。本文档帮助后续 AI 快速理解架构与约定，避免重复踩坑。

## 1. 技术栈

- **Next.js 16.2.9（App Router）+ React 19** — ⚠️ 这是带 breaking changes 的版本，API 与训练数据可能不同。**写代码前先读 `node_modules/next/dist/docs/` 里的对应指南**（项目根 `AGENTS.md` 的硬性要求）。
- **TypeScript**，**Tailwind CSS v4**（配置在 `src/app/globals.css` 的 `@theme`，无 tailwind.config）。
- **Supabase**（`@supabase/ssr`）— 鉴权 + `profiles.is_premium` 订阅状态。
- **Lemon Squeezy** — 支付，webhook 回写订阅状态。
- **lucide-react** — 图标。
- 包管理：同时存在 `pnpm-lock.yaml` 和 `package-lock.json`，**以 pnpm 为准**。
- 脚本：`pnpm dev`（`next dev --webpack`）、`pnpm build`、`pnpm lint`。

## 2. 多语言模型（核心概念，务必先读）

两个正交的「语言」维度，**互不干扰**：

1. **学习目标语言 `target_lang`**（zh / en）：决定读哪门语言的故事。正文、音频、逐词时间戳都是这门语言。学中文与学英文是**两套完全独立的故事**（即使剧情相同也是不同 story）。
   - `gloss_lang`：释义所用语言（面向哪种母语者）。当前：学中文故事释义英文（`zh`→`en`），学英文故事释义中文（`en`→`zh`）。
   - `level_system`：中文用 `HSK`（HSK 1–9），英文用 `CEFR`（A1–C2）。
2. **界面语言 UI locale**（zh / en）：只翻译导航/按钮/提示等 chrome 文案。**与学习语言无关**——选中文界面照样能学中文。

### 故事数据格式（两套并存）

**A) 结构化故事（StoryJSON）— 主力格式，新故事都用它**
- 数据按目标语言分目录：`src/data/stories/<target>/<id>.json`。
  - 当前：`zh/master-secret.json`（师尊的秘密，8 节点）、`zh/last-train.json`（末班地铁，17 节点）、`en/haunted-house.json`（鬼屋一夜，B1，8 节点）。
- 逐词切分，带音频时间戳。类型见 `src/types/story.ts`。
- story id **全局唯一**（跨语言），便于 API 与进度按 id 区分。

**B) Legacy 故事（STORY_REGISTRY）— 旧格式，勿扩展**
- 数据在 `src/data/stories.ts` 的 `STORY_REGISTRY`，整段 `text` + `translations` 字典。
- 仅 `lost-letter` 在用。新故事不要用这个格式。

### 故事归属判定（结构化 vs legacy）

⚠️ **不再有客户端硬编码 id 列表**。阅读页进入时探测 `GET /api/stories/[id]`：200 → 结构化（按需加载），404 → 回退 legacy（本地 `STORY_REGISTRY`）。判定收敛到服务端单一数据源，加故事**只改服务端 registry**，客户端无需同步。探测期间显示 loading，避免误闪 legacy 内容。

## 3. 生产级数据切分（重要架构）

结构化故事**不再一次性全量下发**到客户端（避免流量浪费 + 付费内容泄漏）。三个 API：

| 端点 | 作用 | 缓存 |
|------|------|------|
| `GET /api/stories?target=zh\|en` | **卡片目录**（列表页/首页）：按学习目标语言过滤；省略 target 返回全部 | 公开可缓存 |
| `GET /api/stories/[id]` | 轻量**清单**：节点 id、choices、premium 标记、`target_lang`/`gloss_lang`/`level`/`level_system`、总数，**剥离正文/时间戳** | 公开可 CDN 缓存 |
| `GET /api/stories/[id]/nodes/[nodeId]` | **单节点**完整内容（正文+时间戳） | private |

- 数据源仍是 `src/data/stories/<target>/*.json`，由 `src/lib/stories/registry.ts` 在服务端切片。
- 服务端 registry 两张表：`LOADERS`（id→正文加载器）+ `CATALOG`（卡片元数据，含 `target_lang`/`level`/`genre`/`locked`/`image`）。
- **付费鉴权在服务端**：premium 节点（被 `premium:true` 选项指向的目标）请求时 `await isPremium()`，未订阅返回 **403**，内容不出服务端。鉴权放在节点存在性检查**之前**（防止"付费节点是否存在"也泄漏）。
- 客户端阅读页：探测清单 → 按需拉节点 → **内存缓存 `nodeCache`**，重读/跳转不重复请求。
- 体积实测（last-train）：全量 50KB → 清单 3KB + 每节点 ~4KB。

## 4. 关键功能与对应文件

| 功能 | 文件 | 说明 |
|------|------|------|
| 阅读器（主页面） | `src/app/stories/[id]/page.tsx` | 探测式结构化/legacy 双分支；按需加载；续读；路径图入口；按 `target_lang` 适配字体/TTS |
| 逐词高亮 + tooltip | `src/components/WordSegment.tsx` | tier 决定交互：`base` 不高亮 / `normal` hover 700ms 出 / `key` 立即出。读音字段为 `reading`（中文拼音 / 英文 IPA） |
| 音频/朗读同步高亮 | `src/hooks/useAudioSync.ts` | 有 `audio_url` 走真音频，否则浏览器 TTS 兜底（按 `lang` 选 zh-CN/en-US 语音）；按 timestamps 高亮当前词 |
| 路径图（分支地图） | `src/components/StoryMap.tsx` + `src/lib/storyGraph.ts` | 弹窗；已访问点亮可点击跳转，未访问显示「？」+ 连线；BFS 自动布局；吃 manifest |
| 路径图节点短标题 | `src/data/storyMaps.ts` | 每个故事 `{nodeId: 短标题}`，与正文分离 |
| 阅读进度 | `src/lib/progress.ts` | 「探索覆盖率」= 已访问节点数 ÷ 总节点数 |
| 续读（恢复位置） | `src/lib/progress.ts` + 阅读页 | 见下方 §6 |
| 故事列表/筛选 | `src/app/stories/page.tsx` | 顶部「正在学」切 target；按 HSK/CEFR 等级筛选、搜索、真实进度条；卡片来自 `/api/stories` |
| 界面多语言 | `src/i18n/dictionaries.ts` + `src/i18n/I18nProvider.tsx` | 自建轻量字典 + `useTranslations()`；无第三方库 |
| 鉴权数据访问 | `src/lib/dal.ts` | `getUser` / `getSession` / `isPremium`（React `cache` 包裹） |
| 支付 webhook | `src/app/api/webhooks/lemonsqueezy/route.ts` | HMAC 验签，service role 回写 `is_premium` |

## 5. 界面多语言（i18n）

- `src/i18n/dictionaries.ts`：`DICTS.{en,zh}` 扁平 key→文案字典 + `translate()`。新增文案在两个字典都加一条 key。
- `src/i18n/I18nProvider.tsx`：Context Provider，挂在 `src/app/layout.tsx` 根部。`useTranslations()` 返回 `{ t, lang, setLang }`。
- 偏好存 **cookie（`cm_ui_lang`，供 SSR）+ localStorage**。SSR/CSR 一致性：初始统一 `en`，挂载后再切到存储值。
- 导航栏有 🌐 切换按钮（`Navbar.tsx`）。
- ⚠️ 切界面语言**不影响**在读故事；切「正在学」（列表页）才换故事库。

## 6. localStorage 约定（客户端持久化）

| key | 类型 | 含义 | 写入处 |
|-----|------|------|--------|
| `cm_ui_lang` | "zh"\|"en" | 界面语言偏好（同时写 cookie） | I18nProvider.setLang |
| `cm_saved_words` | string[] | 收藏的生词（全局，跨故事） | WordSegment 保存按钮 |
| `savedWordsCount` | number | 收藏数（列表页侧栏展示用） | 同上 |
| `cm_visited_<id>` | string[] | 已探索的节点集（路径图点亮 + 进度分子） | 节点内容成功加载后 |
| `cm_total_<id>` | number | 故事总节点数（进度分母） | 清单加载后 |
| `cm_pos_<id>` | string | **续读游标**：当前节点 | 选择/跳转时；结局返回列表时清除 |

**续读语义**：阅读中途刷新/退出 → 恢复到 `cm_pos`；走到结局点「返回列表」→ 清除游标，下次从头。恢复时校验节点存在性；付费 403 节点会回退到最近成功节点。

## 7. 设计系统（Tailwind v4 tokens）

- 全部 token 定义在 `src/app/globals.css` 的 `@theme`：颜色（`--color-primary` 等 M3 命名）、字体、间距。
- 容器最大宽 `--spacing-container-max: 1280px`（`max-w-container-max`）。
- 阅读正文固定 `max-w-2xl`（保证长文可读性，不随容器变宽）。
- 自定义高亮 class：`.word-key` / `.word-normal` / `.word-audio-active`（在 globals.css）。

## 8. 新增一个结构化故事的完整流程

1. 参考 `docs/story-authoring-prompt.md`（含可直接喂 AI 的生成 prompt + 数据结构说明 + 校验脚本）。
2. 推荐用**构建脚本**生成 JSON（中文见 `scripts/build-last-train.mjs`，英文见 `scripts/build-haunted-house.mjs`）：维护一份词典 `DICT` + 分词节点，脚本自动算 timestamps 并校验对齐/断链/孤立节点。手写巨型 JSON 易错。
3. 产物保存为 `src/data/stories/<target>/<id>.json`，故事内必含 `target_lang`/`gloss_lang`/`level`/`level_system`。
4. **只需改服务端 `src/lib/stories/registry.ts`**（客户端不再有 id 列表）：
   - `LOADERS` 加一行 `import("@/data/stories/<target>/<id>.json")`；
   - `CATALOG` 加一张卡片（含 `target_lang`/`level`/`genre`/`locked`/`image`）；
   - `src/data/storyMaps.ts` 加该故事的节点短标题（路径图用）。
5. 校验要点：`text_segments.length === timestamps.length`、时间戳单调连续、`next_node_id` 命中真实节点（`end_back_to_list` 是结局保留 id）、非 base 词 `reading`/`meaning`/`level` 齐全。
6. 新增 UI 文案时记得在 `src/i18n/dictionaries.ts` 的 en + zh 两个字典都加 key。

## 9. 数据结构速记（`src/types/story.ts`）

```
TargetLang    "zh" | "en"   学习目标语言（= 故事正文语言）
LevelSystem   "HSK" | "CEFR"
TextSegment   { word, reading|null, meaning|null, level|null, tier, isPlotKeyword? }
              reading: 中文拼音 / 英文 IPA；tier: "base"(标点/虚词) | "normal" | "key"
Timestamp     { start, end }  // 毫秒，与 text_segments 一一对应
StoryChoice   { text, next_node_id, premium? }  // next_node_id="end_back_to_list" 表结局
StoryJSON     { story_id, target_lang, gloss_lang, title_cn, title_en, level, level_system, nodes }
StoryManifest { ...上述 meta, start_node_id, node_count, nodes:{[id]:{choices, premium}} }  // 清单 API
StoryNodeResponse { node_id, bg_image, audio_url, text_segments[], timestamps[], choices[] }  // 单节点 API
StoryCard     { id, target_lang, title_cn, title_en, level, level_system, genre, locked, image }  // 目录 API
```

## 10. 注意事项 / 坑

- **Next 16 是非常规版本**，写任何 Next 相关代码前查本地 docs。
- 加结构化故事**只改服务端 registry**（§8.4）；阅读页靠探测 API 自动识别，无需同步客户端列表。
- 改 UI 文案要在 `dictionaries.ts` 的 en/zh **两个**字典同步加 key。
- `src/app/stories/[id]/page.tsx` 有既有 lint 告警（effect 内 setState 等），非回归，build 不受影响。
- 验证用 `pnpm build`（TypeScript + 静态生成全绿即可）；本地 Chrome 调试实例可能被占用导致截图工具不可用。
- 故事正文/付费内容**绝不能** import 进客户端组件（会进 bundle 泄漏），只能经 API。`src/lib/stories/registry.ts` 仅供 `src/app/api/` 引用。
- `lost-letter` 仍是 legacy 格式（`STORY_REGISTRY`，正文+translations），未迁到结构化；它走探测后的 404 回退分支，正常可读但不享受按节点懒加载。

