# 设计文档：故事生成工作流 + 富化层（Story Generation Pipeline）

> 状态：设计待评审（2026-06-15）。目标读者：实现该工作流的工程师/AI。
> 关联：扩展现有 `scripts/build-*.mjs` 与 `src/types/story.ts` schema；产物落地到 `src/data/stories/<target>/<id>.json`，经 `/api/stories` 下发（见 `docs/PROJECT_OVERVIEW.md`）。

## 0. 一句话目标

输入一句话设定（题材 + 目标语言 + 难度），**一条命令**产出：符合现有 schema 的完整故事 JSON（剧情/分支/逐词切分/读音/释义/分级/tier）+ 合成音频 MP3 + 词级对齐时间戳 + 自动校验，可直接入库。

把 LLM 从"凭空造 50KB JSON"降级为"写剧情 + 做判断"，机械字段交给确定性的库/词表，**大幅降低幻觉、可量产**。

---

## 1. 核心理念：LLM 与库的边界

让模型做它擅长的（创作、上下文判断），让库做它擅长的（确定性机械填充）。

| 字段 | 负责方 | 工具 |
|------|--------|------|
| 剧情、分支结构、每节点正文（目标语） | **LLM** | 主创作 prompt |
| 剧情关键词标注 `isPlotKeyword` | **LLM** | 创作时一并标 |
| 分词 `word[]` | **库** | 中文 jieba / 英文 Intl.Segmenter |
| 读音 `reading`（拼音/IPA） | **库** | 中文 pinyin-pro（带上下文消歧多音字）/ 英文 IPA 表 |
| 释义候选池 | **库** | 中文 CC-CEDICT / 英文 ECDICT |
| `meaning` 最终选义 + 压简 | **LLM** | 上下文消歧（只在候选池里选） |
| `level`（HSK/CEFR） | **词表** | HSK 3.0 词表 / ECDICT 的 CEFR·frq 字段 |
| `tier`（base/normal/key） | **规则 + LLM 微调** | 等级映射兜底，LLM 可上调剧情词 |
| `timestamps` | **库** | TTS 词级时间戳 / forced alignment |

关键原则：**机械字段绝不让 LLM 生成**；**判断字段绝不让库硬来**。

---

## 2. 按语言可插拔的富化层（最重要的架构决定）

⚠️ jieba / pinyin-pro / CC-CEDICT **都是中文专用**。英文故事（`target_lang: "en"`）完全用不上。因此富化必须是**按 `target_lang` 分发的可插拔接口**，绝不能写死成"中文脚本"。

```ts
// scripts/lib/enrich/types.ts
export interface EnrichedToken {
  word: string;
  reading: string | null;   // 拼音 / IPA
  candidates: string[];      // 词典给的释义候选池（gloss_lang 语言）
  level: string | null;      // HSK x / CEFR x
  baseGuess: boolean;        // 是否疑似功能词/标点（tier base 的初判）
}

export interface LanguageEnricher {
  /** 把一句正文切成词并富化（不含 LLM 消歧，纯库/词表） */
  enrich(sentence: string, glossLang: "zh" | "en"): EnrichedToken[];
}
```

两个实现：

| target_lang | 分词 | 读音 | 释义候选（gloss） | 分级 |
|-------------|------|------|------------------|------|
| `zh`（学中文，gloss=en） | `jieba` | `pinyin-pro` | **CC-CEDICT**（中→英） | **HSK 3.0 词表** |
| `en`（学英文，gloss=zh） | `Intl.Segmenter` / 空格 | IPA 表（CMUdict/g2p）或留空 | **ECDICT**（英→中，自带释义） | **ECDICT 的 CEFR/frq 字段** |

> 注意方向：CC-CEDICT 是**中→英**，正好服务"学中文/释义英文"；它**不**服务"学英文/释义中文"，那个方向用 **ECDICT**（一个库同时含中文释义 + CEFR + 词频，省一个依赖，强烈推荐）。

`level` 是你原清单遗漏的关键件——jieba/pinyin/CEDICT 都不给分级，**必须额外引词表**。

---

## 3. 依赖与数据资源

### 运行时依赖（不进客户端 bundle，仅工作流脚本用）
- `nodejieba`（或 `@node-rs/jieba`，Rust 实现更快无需编译）— 中文分词
- `pinyin-pro` — 中文注音，带上下文多音字消歧
- TTS SDK（二选一，见 §5）

### 离线数据资源（放 `scripts/data/`，不进仓库 bundle，`.gitignore` 大文件或用 Git LFS）
- **CC-CEDICT**（`cedict_ts.u8`，~8MB）— 中→英词典
- **ECDICT**（`ecdict.csv`，~30MB）— 英→中词典 + CEFR + 词频；中文释义 + 学英文分级
- **HSK 3.0 词表**（HSK 1–9 分级词表，CSV/JSON）— 中文分级

启动时一次性载入内存建 Map，富化阶段查表 O(1)。

---

## 4. 管线分阶段

```
输入: { target_lang, gloss_lang, genre, level, level_system, brief }
                │
   ┌────────────▼─────────────┐
   │ ① LLM 创作（结构化输出）   │  写剧情+分支+每节点正文（纯目标语字符串）
   │                          │  标 isPlotKeyword（词或短语列表）
   └────────────┬─────────────┘  产物: { nodes: {id: {text, choices, plotWords[]}} }
   ┌────────────▼─────────────┐
   │ ② 富化层（按 target 分发） │  enrich(text): 分词→读音→候选释义→level→baseGuess
   └────────────┬─────────────┘  产物: 每节点 EnrichedToken[]
   ┌────────────▼─────────────┐
   │ ③ LLM 消歧（批量、低成本） │  仅对 normal/key 词：从候选池选义+压成一句学习者释义
   │                          │  输入候选池，禁止自由发挥（约束幻觉）
   └────────────┬─────────────┘  产物: 每词最终 meaning
   ┌────────────▼─────────────┐
   │ ④ 组装 TextSegment        │  tier = 规则(level→tier) ∪ LLM 标的 plotWords→key
   └────────────┬─────────────┘
   ┌────────────▼─────────────┐
   │ ⑤ 音频 + 对齐             │  正文→TTS→MP3 + 词级时间戳（见 §5）
   └────────────┬─────────────┘  产物: audio_url + timestamps[]（与 segments 对齐）
   ┌────────────▼─────────────┐
   │ ⑥ 校验 + 入库             │  复用现有断链/对齐/字段校验 → 写 JSON + registry 提示
   └──────────────────────────┘
```

### 阶段细节

**① 创作**：用 LLM 结构化输出（JSON schema 约束），只产出剧情骨架——节点正文是**纯字符串**（不分词），加一个 `plotWords: string[]` 标剧情关键词。这一步不碰任何机械字段。

**② 富化**：对每节点正文跑 `enrich()`。这是纯确定性步骤，无 LLM、无网络。多音字/分词/分级全部在此定。`tier` 先按规则初判（见 §6）。

**③ 消歧**：CC-CEDICT/ECDICT 一个词常有多条义项且偏书面。**批量**把 `{词, 句子, 候选[]}` 喂 LLM，要求：(a) 从候选里选最贴合上下文的；(b) 压成一句简短的学习者释义。**关键约束**：只能在候选池内选，不允许编造，从根上掐断释义幻觉。base 词跳过（无释义）。

**④ 组装**：`tier` 终值 = 等级映射规则 ∪ LLM 在①标的 `plotWords`（强制 key + isPlotKeyword）。

**⑤ 音频**：见 §5。

**⑥ 校验入库**：复用现有 `build-*.mjs` 的校验（`segments.length===timestamps.length`、时间戳单调连续、`next_node_id` 命中、非 base 词三字段齐全），通过则写 `src/data/stories/<target>/<id>.json`，并打印 registry 登记提示。

---

## 5. 音频 + 词级时间戳（你要的"真音频"）

这是替代当前"脚本按字数估算 timestamps"的关键升级——真实音频 + 真实对齐。

### 5.1 按 target_lang 可插拔的 TTS 供应商（核心设计）

和富化层一样，**TTS 也必须按目标语言可插拔**——中文用国内供应商（合规、稳、便宜），英文用海外供应商（音色更自然地道）。绝不把某一家写死。

```ts
// scripts/lib/tts/types.ts
export interface WordTiming { word: string; start: number; end: number } // ms

export interface TtsResult {
  audio: Buffer;            // 音频字节（mp3）
  timings: WordTiming[];    // 词级时间戳（已从供应商原始粒度聚合到词）
}

export interface TtsProvider {
  readonly name: string;
  /** 合成一段文本，返回音频 + 词级对齐 */
  synthesize(opts: {
    text: string;
    lang: "zh" | "en";
    words: string[];        // 富化层②已固定的分词，用于把字符/音素级时间戳聚合到词
    voice?: string;
  }): Promise<TtsResult>;
}

// scripts/lib/tts/index.ts
// 按 target_lang 选供应商；可被环境变量覆盖，未配置则返回 null → 降级
export function getTtsProvider(targetLang: "zh" | "en"): TtsProvider | null;
```

默认映射（可经 env 覆盖）：

| target_lang | 默认供应商 | 备注 |
|-------------|-----------|------|
| `zh` | **腾讯云 TTS** | 见 §5.2 |
| `en` | **海外供应商**（Azure / ElevenLabs，二期定） | 英语音色更自然；接口同 `TtsProvider` |

### 5.2 腾讯云 TTS（中文默认实现）

文档：https://cloud.tencent.com/document/product/1073/37995（基础语音合成，一次性同步 API）

关键能力与适配点：
- **时间戳**：设 `EnableSubtitle: true`，返回 `Subtitles[]`，每项是**字符级** `{ Text, BeginIndex, EndIndex, BeginTime, EndTime, Phoneme }`（毫秒）。⚠️ 这是**字符级**，需在适配器内**聚合到词**：按富化层给的 `words[]` 顺序，把落在每个词字符区间内的 subtitle 的 `BeginTime`/`EndTime` 合并成该词的 `{start,end}`。
- **音频格式**：`Codec` 支持 wav/mp3/pcm → 用 **mp3**；采样率 16000(默认)/24000/8000。
- **语言**：`PrimaryLanguage` 1=中文(默认) 2=英文（即腾讯云也能做英文，但英文我们优先海外供应商）。
- ⚠️ **部分超自然音色不支持时间戳** → 选音色时必须挑支持 `Subtitles` 的，否则退化到估时。
- ⚠️ **文本长度限制**：单次约 150 汉字 / 500 英文字母。**故事节点正文常超限 → 必须分块合成再拼接**：按句/标点切块，分别合成，拼接音频并对**后续块的时间戳整体加上前序块的累计时长偏移**，保证全局 `{start,end}` 连续。
- 鉴权：腾讯云 API 密钥（SecretId/SecretKey）走 env，**绝不入仓**。

### 5.3 通用流程

```
富化后的 word[]（②已固定）
   → 正文按长度限制分块
   → 每块调 TtsProvider.synthesize() 拿 {audio, timings}
   → 拼接音频(mp3) + 时间戳按块偏移累加
   → 词级 timings 映射回每个 TextSegment 的 {start,end}
```

因为分词在②已固定，词边界能稳定对齐；供应商各自把"字符级/音素级"原始粒度在**适配器内部**聚合到词，对上层暴露统一的 `WordTiming[]`。

### 5.4 备选：forced alignment（已有人声音频时）
- `whisperX` / `aeneas` / Montreal Forced Aligner 把音频和文本对齐。适合 §V2 真人配音补录。

### 5.5 音频格式与降级
- **格式**：项目现有 `audio_url` 指向静态文件（如 `/audio/<id>-<node>.mp3`）。工作流产出 MP3 存 `public/audio/`，节点 `audio_url` 填路径。（"MP4"一般指带画面的视频，纯旁白用 MP3 即可；要做带字幕的视频再单开工作流。）
- **降级**：`getTtsProvider()` 返回 null（未配 key / CI 环境）时，回退到当前"按字数估时 + 浏览器 TTS 朗读"，保证工作流无外部依赖也能产出可用故事。

---

## 6. tier 判定规则（库 + 规则 + LLM）

`tier` 决定前端高亮交互，需稳定。规则优先，LLM 兜剧情判断：

```
1. 标点 / 引号对白           → base
2. 在功能词白名单（的/了/在/the/a/of…） → base
3. 否则按 level 映射：
   中文 HSK1~2 → base 倾向；HSK2~4 → normal；HSK5+ → key
   英文 A1     → base 倾向；A1~B1 → normal；B2+   → key
4. LLM 在①标的 plotWords  → 强制 key + isPlotKeyword（覆盖上面）
```


功能词白名单沿用现有 `build-*.mjs` 里的 `BASE_WORDS`，抽到 `scripts/lib/enrich/baseWords.ts` 共享。

---

## 7. 目录结构（新增）

```
scripts/
  generate-story.mjs            # 工作流主入口（一条命令）
  lib/
    enrich/
      types.ts                  # LanguageEnricher 接口
      baseWords.ts              # 功能词白名单（中/英）
      zh.ts                     # jieba + pinyin-pro + CC-CEDICT + HSK 表
      en.ts                     # Intl.Segmenter + IPA + ECDICT(+CEFR)
      index.ts                  # getEnricher(target_lang)
    tts/
      types.ts                  # TtsProvider 接口 + WordTiming
      tencent.ts                # 腾讯云 TTS（中文默认；字符级→词级聚合 + 分块）
      foreign.ts                # 海外供应商（英文；Azure/ElevenLabs，二期）
      index.ts                  # getTtsProvider(target_lang)，未配置→null（降级）
    llm.ts                      # LLM 调用封装（创作 + 消歧），结构化输出
    validate.ts                # 抽离现有 build 脚本的校验逻辑（共享）
  data/                         # 离线词典/词表（.gitignore 或 LFS）
    cedict_ts.u8
    ecdict.csv
    hsk30.json
public/audio/                   # 工作流产出的 MP3
```

现有 `build-last-train.mjs` / `build-haunted-house.mjs` 保留为"手写词典"的简化路径，或迁移为调用新富化层；不强制立即重写。

---

## 8. 命令接口

```bash
# 一句话生成
node scripts/generate-story.mjs \
  --target zh --level "HSK 4" --genre 悬疑 \
  --brief "主角在老宅发现一封信，牵出家族秘密" \
  --id old-house-letter

# 学英文
node scripts/generate-story.mjs \
  --target en --level B1 --genre mystery \
  --brief "A detective receives an anonymous letter" \
  --id detective-letter

# 无 TTS key 时自动降级到估时 + 不产音频，仍出可用 JSON
# --no-audio 显式跳过音频
# --dry-run  只产 JSON 不写盘，打印校验结果
```

产出后打印：
```
✓ src/data/stories/zh/old-house-letter.json (12 节点)
✓ public/audio/old-house-letter-*.mp3 (12 files)
→ 请在 src/lib/stories/registry.ts 的 LOADERS + CATALOG 登记，
  并在 src/data/storyMaps.ts 补节点短标题。
```

> 登记**保留手动确认点**（已决策）：工作流不自动改源码 `registry.ts`，由人工登记，避免脚本改源码出错、并留一道内容审核关。

---

## 9. 成本与质量控制

- **LLM 调用 2 次/故事**：① 创作（1 次大）+ ③ 消歧（1 次批量，所有生词一起）。不要每词一次。
- **消歧约束**：候选池来自词典，LLM 只选不造 → 释义幻觉趋近 0。
- **缓存**：词→读音、词→候选释义、词→level 全可跨故事缓存（词典是静态的），同词不重复查。
- **校验是硬门**：⑥ 不过不入库。新增校验项：`reading` 非空率（非 base 词应有读音）、`level` 覆盖率。

---

## 10. 与冷启动路线的关系

这正是上一轮"上线前第 1 项工作流"的完整设计。它直接解锁：
- **内容量**：从手搓一个个堆 → 一条命令量产 8~12 个首发故事；
- **真音频**：从估时 → TTS 真音频 + 真对齐；
- **后续 UGC 地基**：用户版"AI 生成故事"（V2）就是给这个工作流套个受控的前端 + 审核，内部工具先打磨成熟。

## 11. 分期落地建议

| 阶段 | 范围 | 产出 |
|------|------|------|
| **P1** | 富化层（zh + en）+ 校验抽离，**先不接 LLM/TTS**，用现有手写故事正文验证富化正确性 | `enrich()` 跑通，拼音/分级准确 |
| **P2** | 接 LLM 创作 + 消歧 | 一句话 → 完整 JSON（估时音频） |
| **P3** | 接 TTS（腾讯云中文 + 海外英文）+ 词级时间戳 | 真音频 + 真对齐 |
| **P4** | 量产首发内容 + 接入 registry | 8~12 个故事上线就绪 |

P1 风险最低、最该先做——它独立可验证，且是后面一切的地基。

---

## 12. 已决策（评审结论 2026-06-15）

1. **TTS 供应商**：✅ 按 `target_lang` 可插拔。中文默认**腾讯云 TTS**（字符级 Subtitles → 适配器内聚合到词；注意 150 字/块限制需分块、超自然音色无时间戳）；英文用**海外供应商**（Azure / ElevenLabs，二期定）。统一 `TtsProvider` 接口，未配置 key → 降级估时。
2. **英文词典**：✅ 用 **ECDICT**（释义 + CEFR + 词频一体）替代 CC-CEDICT 做英→中方向；中→英方向仍用 CC-CEDICT。
3. **词表许可**：✅ 可接受。落地时遵守各自署名/传染条款（CC-CEDICT 为 CC-BY-SA）。
4. **registry 登记**：✅ **手动**。工作流不自动改源码，保留人工登记 + 内容审核确认点。

