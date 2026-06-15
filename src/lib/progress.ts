/**
 * 阅读进度：基于「探索覆盖率」——已访问的不同节点数 ÷ 故事总节点数。
 *
 * 数据来源（均由阅读页 src/app/stories/[id]/page.tsx 写入 localStorage）：
 *   cm_visited_<storyId>  string[]  已走过的节点 id（含 start）
 *   cm_total_<storyId>    number    该故事的总节点数（分母）
 *   cm_pos_<storyId>      string    当前阅读位置（续读游标）；走到结局并返回列表时清除
 *
 * 这样设计的好处：分母由「唯一能拿到完整 nodes 的阅读页」写入，
 * 列表页只读，不会和故事内容脱节；与路径图点亮的节点集是同一份数据。
 */

export interface StoryProgress {
  percent: number;   // 0-100
  visited: number;   // 已访问节点数
  total: number;     // 总节点数（0 表示尚未打开过该故事）
  started: boolean;  // 是否打开/读过
  completed: boolean;// 是否已探索全部节点
}

const EMPTY: StoryProgress = { percent: 0, visited: 0, total: 0, started: false, completed: false };

export function getStoryProgress(storyId: string): StoryProgress {
  if (typeof window === "undefined") return EMPTY;

  const rawVisited = localStorage.getItem(`cm_visited_${storyId}`);
  const rawTotal = localStorage.getItem(`cm_total_${storyId}`);
  if (!rawVisited) return EMPTY;

  let visited = 0;
  try {
    visited = new Set<string>(JSON.parse(rawVisited)).size;
  } catch {
    return EMPTY;
  }

  const total = rawTotal ? parseInt(rawTotal, 10) || 0 : 0;
  const percent = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;

  return {
    percent,
    visited,
    total,
    started: visited > 0,
    completed: total > 0 && visited >= total,
  };
}

// ── 续读游标（cm_pos_<storyId>）────────────────────────────────────────────
// 语义：阅读中途退出/刷新时记住当前节点；走到结局并点「返回列表」时清除，
// 下次重进从头开始（仍可经路径图跳回已解锁节点）。

const posKey = (storyId: string) => `cm_pos_${storyId}`;

/** 读取上次阅读位置；无记录返回 null。 */
export function getReadingPosition(storyId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(posKey(storyId));
}

/** 保存当前阅读位置。 */
export function setReadingPosition(storyId: string, nodeId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(posKey(storyId), nodeId);
}

/** 清除阅读位置（读到结局并返回列表时调用）。 */
export function clearReadingPosition(storyId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(posKey(storyId));
}
