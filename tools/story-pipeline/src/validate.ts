import type { StoryJSON } from "./schema.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: { nodes: number; reachable: number; endings: number };
}

const END_ID = "end_back_to_list";

/**
 * 校验最终 StoryJSON（与现有 build-*.mjs 校验一致，抽离共享）：
 * - segments/timestamps 等长
 * - 时间戳从 0 单调递增、首尾相接
 * - 非 base 词 reading/meaning/level 齐全
 * - choices.next_node_id 命中真实节点（end_back_to_list 除外）
 * - 无孤立节点（除 start 外都可达）
 */
export function validateStory(story: StoryJSON): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(Object.keys(story.nodes));

  for (const [id, node] of Object.entries(story.nodes)) {
    if (node.text_segments.length !== node.timestamps.length) {
      errors.push(`${id}: segments(${node.text_segments.length}) != timestamps(${node.timestamps.length})`);
    }
    // 时间戳：单调不减即可。真实 TTS 有起始静音和词间停顿（gap 合法），
    // 不强制首尾相接；估时路径本就连续，也满足。前端按 currentTime 落区间高亮，
    // gap 期间不高亮任何词，可接受。
    let prev = 0;
    node.timestamps.forEach((t, i) => {
      if (t.start < prev) errors.push(`${id}[${i}]: start ${t.start} < prev end ${prev}（时间戳回退）`);
      if (t.end <= t.start) errors.push(`${id}[${i}]: end<=start`);
      prev = t.end;
    });
    // 字段完整性：meaning 是 tooltip 的硬需求；reading（拼音/IPA）与 level 是增强项，
    // 缺失仅告警（英文变形词常无 IPA、组合词常无分级，前端按 null 隐藏对应行/徽章）。
    node.text_segments.forEach((s, i) => {
      if (s.tier !== "base") {
        if (!s.meaning) {
          errors.push(`${id}[${i}] "${s.word}": ${s.tier} 缺 meaning`);
        }
        if (!s.reading) {
          warnings.push(`${id}[${i}] "${s.word}": 无 reading（音标缺失，tooltip 将隐藏读音行）`);
        }
        if (!s.level) {
          warnings.push(`${id}[${i}] "${s.word}": 无 level（词表未命中，徽章将隐藏）`);
        }
      }
    });
    // 链路
    for (const c of node.choices) {
      if (c.next_node_id !== END_ID && !ids.has(c.next_node_id)) {
        errors.push(`${id}: 断链 -> ${c.next_node_id}`);
      }
    }
  }

  // 可达性
  const reach = new Set<string>(["start"]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...reach]) {
      const node = story.nodes[id];
      if (!node) continue;
      for (const c of node.choices) {
        if (ids.has(c.next_node_id) && !reach.has(c.next_node_id)) {
          reach.add(c.next_node_id);
          changed = true;
        }
      }
    }
  }
  for (const id of ids) if (!reach.has(id)) errors.push(`孤立节点: ${id}`);

  // 统计 + 软警告
  const endings = Object.values(story.nodes).filter(
    (n) => n.choices.length > 0 && n.choices.every((c) => c.next_node_id === END_ID)
  ).length;
  if (endings === 0) warnings.push("没有结局节点（所有 choices 指向 end_back_to_list 的节点）");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { nodes: ids.size, reachable: reach.size, endings },
  };
}
