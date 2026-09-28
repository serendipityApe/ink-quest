# 中文首发故事批次：2026-09

本批共五个原创故事：四篇完整短篇，每篇 20 个节点；一部仙侠连载的第一部，24 个节点。全部中文正文、英文释义，无付费选项。HSK 为编辑目标，仍需真实读者验证。

## 阅读长度与创作规则

- 短篇每条完整路线 12 段，正文目标 1,500–2,200 汉字；通常每节点 130–185 汉字。
- 连载第一部每条路线 18 段，正文目标 3,000–4,000 汉字；通常每节点 175–235 汉字。
- 总节点包含互斥分支，不能把总节点字数当作单次阅读长度。
- 主线有发展、人物有动机，选择产生具体经历与后果。汇合节点不得假设读者持有另一分支独有的物品或知识。
- 全图为有向无环图，所有节点可达、所有路线能到结尾。结束选项指向 `end_back_to_list`。
- 正文自然、易读，少成语少生僻词；题材词在首次出现时用上下文解释。用短句承载成人情节，不用儿童口吻。
- 连载本部解决完整的眼前事件；结尾标明“第一部完”，留下后续线索，不提供不存在的下一部链接。
- 复用现有 draft → enrich → 逐词上下文审校 → TTS → validate 流程。机械字段交给现有工具，审校不能只补空释义。

## 1. 借来的山门 1：山下无水

- ID：`the-borrowed-sect-1`；英文：The Borrowed Sect 1: The Dry Village；题材：Xianxia；目标 HSK 4。
- 概要：你以厨房帮工身份进入修仙山门，发现山上的水能让石头发光，山下村庄却没有水。门派借山建院的旧约要求共享山泉；一位管事以保护练功设施为由关了水门。你与送菜的阿禾合作，从旧账或河道取得证据，在春试前修复水路，并在公开旧约与承担守水责任之间作决定。
- 长线：父亲留下的铜钥匙与一份“借山”名单有关；本部只揭开第一处山门。避免力量体系术语堆积，不复制任何已有网文。
- 关键关系：阿禾是当地成年送菜人，了解河道；厨房周叔务实；管事担心水门损坏但隐瞒了村民损失，有可理解的动机。
- 本部成长：从厨房分水练习学会让一小股水沿石纹上行；两个救险分支分别运用这项小本事，结局保留成长回报。
- 续篇预留（本次不生成）：第二部从一个月后启程，两种结局均已完成轮值交接。听雨山的无窗塔以保存山中声音修行，一名报信人却被从塔的记录中抹去；主角追查父亲当年为何留下不同版本的借山约。第三部再将几份约定连到一起，讨论谁有权修改它们。父亲已去世，不用突然复活或梦醒推翻第一部。

| 节点 | 场景与推进 | 后继 |
|---|---|---|
| start | 带父亲铜钥匙上山，先求一份差事 | gate |
| gate | 山门石牌发光，厨房缺人 | kitchen |
| kitchen | 周叔分配挑水任务，送菜人阿禾抱怨村井见底 | water |
| water | 山上满池，山下干沟，发现供水不对等 | orders |
| orders | 春试前禁止开水门；选择查旧账或河道 | archive, river |
| archive | 与保管旧纸的师姐协商，找到借山旧约 | ledger |
| ledger | 旧约记载每日应放水，村民有权查账 | night_meeting |
| river | 随阿禾检查干沟，找到被封的旧水轮 | wheel |
| wheel | 水轮没有坏，封条才挡住了水 | night_meeting |
| night_meeting | 交换所见；另一名同伴补齐未走分支的信息 | practice |
| practice | 用小水槽练习分水，学会控制而非强抢水源 | dawn |
| dawn | 山下求水人上山，管事仍拒绝开门 | sealed_gate |
| sealed_gate | 水压上升；先救桥边人还是修旁渠，由同伴处理另一项 | rescue_bridge, repair_channel |
| rescue_bridge | 解绳并护送人离桥，工具袋落水 | bridge_cost |
| bridge_cost | 借村民工具赶回，救人赢得信任但耽误时间 | hearing |
| repair_channel | 拆除堵板打开旁渠，伤手但止住险情 | channel_cost |
| channel_cost | 阿禾带被救的人赶来，给你包扎 | hearing |
| hearing | 管事承认临时封门后来未复查，双方争责任 | proof |
| proof | 铜钥匙打开旧约匣；父亲曾是见证人 | choice |
| choice | 眼前水路已稳，决定怎样防止重演 | ending_open, ending_guard |
| ending_open | 当众登记共享水量，成立村民与门派轮值 | road_open |
| ending_guard | 自愿试任守水人，约定公开记录与村民复查 | road_guard |
| road_open | 本部事件收束；名单显示另一山门也在借山 | end_back_to_list |
| road_guard | 本部事件收束；父亲旧信提到下一山门 | end_back_to_list |

## 短篇通用节奏

以下四篇各 20 节点，采用同样的可验收节奏，但人物、场景、冲突、选择含义完全不同：开场 → 两条调查/相识路径各两段 → 汇合 → 新期限 → 两条行动各两段 → 真相 → 验证 → 最后选择 → 三种行动各接独立结局。每条路线恰好 12 段。

## 2. 七点前的失物

- ID：`the-seven-oclock-lost-and-found`；英文：Lost and Found Before Seven；Mystery；HSK 4。
- 概要：车站失物处将于七点搬空，一名老人来找装有旧戏录音的蓝布包，但登记显示有人提前领走了。你沿登记簿或值班人线索找到包：工作人员因柜号错位交错了物品，另一位失主正准备离城。无阴谋大反派，悬念来自证据与有限时间；录音是老人亡妻的声音，须尊重隐私与主人决定。
- 图：`start→desk/platform; desk→register; platform→cleaner; register/cleaner→meeting; meeting→deadline; deadline→bus_route/phone_route; bus_route→bus_cost; phone_route→phone_cost; bus_cost/phone_cost→reveal; reveal→test; test→decision; decision→deliver/copy/wait; deliver→ending_reunion; copy→ending_voice; wait→ending_tomorrow`。
- 推进：登记路线发现柜号倒写，站台路线发现蓝包系有不常见的黄绳；meeting 由同事补齐另一条证据。deadline 获知另一失主的末班车将开。赶公交与联系司机都能找到对方，但分别付出交通时间或沟通代价。reveal 排除偷窃，test 通过老人能说出包内未公开细节核实。最后三路：亲自送包且老人错过原车但顺利见家人；双方同意先传一段录音、安排包后送；老人选择安全存包次日亲取。所有结局交代物品归属，无擅自公开私人录音。

## 3. 月面温室

- ID：`the-moon-greenhouse`；英文：The Moon Greenhouse；Science Fiction；HSK 4。
- 概要：月球基地即将进入漫长黑夜，你接班时发现温室耗电升高，系统建议拔掉一排“没有用”的花。温室负责人坚持保留，因为花能提示授粉虫的健康。你查控制记录或观察植物，找出传感器位置错误和循环风不足；在有限备用电力中选择处理方案。
- 图：`start→control/plants; control→logs; plants→bees; logs/bees→meeting; meeting→deadline; deadline→outer_panel/air_duct; outer_panel→panel_cost; air_duct→duct_cost; panel_cost/duct_cost→reveal; reveal→test; test→decision; decision→share_power/trim_crop/manual_watch; share_power→ending_shared; trim_crop→ending_seed; manual_watch→ending_dawn`。
- 推进：观察路径讲清授粉小虫与食物的联系；控制路径发现探头靠近热灯。meeting 补齐发现，deadline 是黑夜前最后储电窗口。两条检修路径有合理防护并由专业同伴协作，不写真实危险操作教程。reveal 明确读数有误但通风问题也真实；test 证实缩小区域可救大部植物。三个结局分别为经全员同意减少娱乐用电、牺牲部分当季产量保种、排班照看保留更多作物但推迟实验。代价各异，不把一条写成唯一正确答案。

## 4. 雨停之前

- ID：`before-the-rain-stops`；英文：Before the Rain Stops；Romance；HSK 3。
- 概要：你在社区书店值最后一班，明天去别的城市工作。常来买旧地图的顾客林安带来一本夹着你们共同批注的书。雨把两人留在店里，关店前需要整理书架与旧照片。双方慢慢确认此前的小心照顾；最后选择当面说出喜欢、约定再见，或坦诚保持朋友关系。人物成年、互相尊重，无强制浪漫和巧合误会堆叠。
- 图：`start→shelf/window; shelf→book_note; window→city_map; book_note/city_map→meeting; meeting→deadline; deadline→photo_box/reading_table; photo_box→photo_memory; reading_table→table_memory; photo_memory/table_memory→reveal; reveal→test; test→decision; decision→speak/next_visit/friendship; speak→ending_beginning; next_visit→ending_date; friendship→ending_friends`。
- 推进：第一组分支分别了解共同读书与未来城市；meeting 互相交流未知信息。deadline 为交钥匙时间，不是“雨停必须表白”。第二组分支用具体共同经历建立情感。reveal 林安此前的来店确实有见你的原因，test 双方谈实际异地安排而非猜谜。最后三条都尊重对方回应并具体交代未来联系。

## 5. 今天谁当店长

- ID：`manager-for-a-day`；英文：Manager for a Day；Slice of Life / Comedy；HSK 3。
- 概要：小餐馆老板临时去接孩子，你首次代管午市。一个订了十二份午饭的电话、一个要找安静角落的客人、和厨房不断打出的重复小票让你以为大订单要翻倍。真相是同一订单从两个渠道进入。你和厨房、客人沟通，在速度、菜单与堂食安排之间作选择。笑点来自真实工作细节，有成人责任感，无恶意羞辱员工。
- 图：`start→kitchen/counter; kitchen→tickets; counter→phone; tickets/phone→meeting; meeting→deadline; deadline→delivery/table_plan; delivery→delivery_cost; table_plan→table_cost; delivery_cost/table_cost→reveal; reveal→test; test→decision; decision→simple_menu/split_delivery/shared_table; simple_menu→ending_lunch; split_delivery→ending_team; shared_table→ending_neighbors`。
- 推进：最初分支分别看厨房小票和确认电话，同事在 meeting 补齐。deadline 是工人午休时间；行动分支试送餐安排或堂食分桌，发现各自代价。reveal 重复订单不是两批客人，test 回拨确认十二人和预算。结局选择均经客人同意：简化菜单按时送达、分两批送并送免费热汤、安排安静区域与拼桌同时照顾散客。老板回来有具体反馈与一个轻松收尾。

## 验收

1. 图结构：短篇 20 节点 / 3 结局 / 每路 12 段；连载 24 节点 / 2 个阶段结局 / 每路 18 段。
2. 正文：逐路径字数达到目标；按真实 token 统计分级分布并审查题材词，不把标签视为认证。
3. 学习辅助：非基础词释义齐全、语境准确；音频真实生成、文件可读、时间戳匹配。
4. 接入：登记故事卡片、加载器、中文地图标签与独立封面。
5. 页面：匿名可读，全篇不含订阅分支；本批不修改全站支付流程。

## 完成与验证记录

已接入本地故事库，未部署生产站点。五篇共 104 节点、56 条完整路线、14 个结局；配有 104 个 Azure 标准晓晓真实音频文件。

| 故事 | 总节点 | 每条路线段数 | 每条路线汉字 | 每条路线音频时长 |
|---|---:|---:|---:|---:|
| 借来的山门 1：山下无水 | 24 | 18 | 3440–3482 | 13.8–13.9 分钟 |
| 七点前的失物 | 20 | 12 | 2158–2195 | 8.1–8.3 分钟 |
| 月面温室 | 20 | 12 | 2054–2080 | 7.9–8.0 分钟 |
| 雨停之前 | 20 | 12 | 2149–2192 | 8.0–8.2 分钟 |
| 今天谁当店长 | 20 | 12 | 2063–2093 | 8.0–8.1 分钟 |

- 图结构、每条路径字数、全部节点地图标签、释义与拼音非空、音频可解析性及时间戳范围检查通过。
- 匿名 HTTP 验证覆盖全部 104 个节点及音频、5 个阅读页的服务端正文、5 张封面。
- 本批修改文件 ESLint 与 `pnpm build`（含 TypeScript）通过；构建提示既有 middleware 命名弃用，与本批内容无关。
- 浏览器实际检查了词义弹层、旁白播放、节点跳转、24 节点路径图与故事库卡片。
- 人工/agent 审校已修正分支汇合、时间线、词义与语境多音字。HSK 3/4 是编辑目标，不是严格词表覆盖认证；人名、组合词及部分常用词未命中现有词表，保留空等级而不编造。

复验：`pnpm --filter @inkquest/story-pipeline exec tsx ../../scripts/check-chinese-story-batch.mjs`。统计产物在 `output/story-batch/verification.json`。

## 封面、入口与资源

当前五篇均使用 PNG 封面，来源和最终提示词见 [封面提示词档案](story-cover-prompts/README.md)：

- 《借来的山门 1》：`the-borrowed-sect-1-inkwash.png`，用户提供的轻水墨成品。
- 《七点前的失物》：`the-seven-oclock-lost-and-found-v2.png`，内置 imagegen 生成。
- 《月面温室》：`the-moon-greenhouse-v2.png`，内置 imagegen 生成。
- 《雨停之前》：`before-the-rain-stops-v2.png`，内置 imagegen 生成。
- 《今天谁当店长》：`manager-for-a-day-v2.png`，内置 imagegen 生成。

旧 demo《师尊的秘密》（`master-secret`）和《末班地铁》（`last-train`）已移除书库及默认导航入口，原正文与加载器保留。

本批 104 个音频和 5 张 PNG 封面通过 Supabase 资产存储承载，二进制文件不入 Git；故事正文、入口配置和提示词文档入 Git。本地副本仍在被忽略的 `public/audio/`、`public/covers/` 中。109 个对象已完成定向上传，并逐个公开下载核验 SHA256 与字节数；未覆盖既有对象。资源键与校验值见 [资产清单](story-assets-2026-09.json)。生产部署状态需以 GitHub Actions 为准。

本次提交快照另在独立目录通过 ESLint、TypeScript 和 `next build --webpack`，仅包含故事、封面与入口调整，不包含本地正在进行的付款、SEO 或书库布局改动。
