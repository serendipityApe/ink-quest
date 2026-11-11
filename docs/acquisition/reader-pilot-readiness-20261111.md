# Reader-pilot readiness review — 2026-11-11

Base: 629b9c0. Scope: public demo quality and honest purchase availability. No analytics or email collection added.

## Demo editorial findings

Story: `the-seven-oclock-lost-and-found`, 20 nodes, 3 endings. Its first two nodes are a reasonable critical-review sample, not a rigorously certified HSK 4 reader.

Text, vocabulary segments, timestamps and existing audio are coupled. Do not change the displayed wording without regenerating/rechecking the affected audio and alignment. The following is an editorial draft only; the published story data is unchanged.

### Suggested revised opening (preserves plot and choices)

你在北站的失物招领处帮忙。今天，办公室要搬到新楼。墙上的钟指向六点，搬运车七点就会来。

你正把空盒子装进纸箱，一位白发老人走了进来。他手里拿着车票，说自己把一个蓝布包落在了候车室。包里没有钱，只有一台旧录音机。说到这里，他紧紧捏住车票，似乎不知道该怎样解释这个包对他有多重要。

你请老人坐下，给他倒了一杯温水。同事小周去拿电脑。你可以先查桌上的登记簿，也可以去问刚打扫过站台的保洁员。

Choices unchanged: 查看失物登记簿 / 去站台寻找线索.

### Further edits to review with matching audio

- `desk`: 今天搬家 → 今天办公室搬迁. The existing sentence uses a household term for an office move.
- `register`: 包交错了 → 把包交给了错误的人. Clearer referent for learners.
- `cleaner`: 记得那位女士离开的先后顺序 → 记得那位女士离开前做了什么. More natural and precise.
- `bus_route`: 自己刚接完一整天的班 → 自己刚上完一天班. The original is not idiomatic.
- `bus_cost`: opening contains multiple time/actions in one sentence; split into arrival time, meeting, handover steps. Retain plot chronology.
- `ending_reunion`: 搬家的车 → 搬运车, consistently.
- Review figurative endings separately rather than flattening all literary voice. The intent is a readable mystery, not a guarantee every word is HSK 4.

### Dictionary scope

Published highlighted vocabulary support is real, but not every word is interactive. Do not promise "tap any word" in outreach. A no-response click on a base-tier word may be intentional, not a broken lookup. Audit the rendering tier and vocabulary data before changing behavior. No extra model or TTS calls made in this task.

## Smallest useful measurement proposal — not implemented

Goal: distinguish distribution from first-read friction and repeat use. Use one campaign source per approved outreach, not personal tracking links per named learner.

Events: `sample_view`, `first_choice`, `story_end`; each only needs public story ID, coarse campaign, event version. Deduplicate repeated render/retry. For return measurement, define a bounded anonymous first-party identifier and retention window, document consent/privacy handling first, and never put email, user ID, generated text, learning mistakes or arbitrary query values into analytics. Browser clearing/device changes mean returns are not person-level truth.

Potential feedback: optional "Too difficult / Just right / Too easy" after a first choice, plus optional "What made you stop?" only if a safe feedback storage workflow is chosen. Newsletter capture is not a prerequisite for a 10-reader pilot. Do not enable external analytics or email marketing subscriptions as a side effect of this copy fix.

## Implemented in this branch

Homepage explicitly shows bilingual closed-purchase notice and labels displayed prices as planned, matching current /subscribe availability. Notice defaults closed, reads existing public `/api/billing/config` without caching, and disappears only after explicit `checkoutEnabled: true`. No balance, customer info or checkout request is made. Existing price/terms and language roller preserved.
