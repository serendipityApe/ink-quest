import type { StoryChoice } from "@/types/story";

/**
 * 路径图布局工具：从故事的节点与选项关系，自动推导一张可渲染的有向图。
 *
 * 只依赖「每个节点的 choices」，因此既能吃全量 StoryJSON，也能吃轻量
 * StoryManifest（生产环境下客户端只拿得到清单，拿不到正文）。
 *
 * - layer：节点到 start 的最短跳数（BFS），决定它在图里的「列」。
 * - 终局节点：所有 choices 都指向保留 id "end_back_to_list" 的节点，标记 isEnding。
 *   "end_back_to_list" 本身是返回列表的动作，不作为图节点渲染。
 * - 同层节点按首次被发现的顺序排列（col）。
 */

/** buildStoryGraph 所需的最小输入：每个节点只要有 choices 即可。 */
export interface GraphInput {
  nodes: Record<string, { choices: StoryChoice[] }>;
  start_node_id?: string;
}

export interface GraphNode {
  id: string;
  layer: number;
  col: number;        // 同层内的序号（0-based）
  label: string;      // 路径图上显示的短标题
  isEnding: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface StoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layerCount: number;
  maxLayerWidth: number;          // 最宽一层的节点数，供布局算高度
  byId: Record<string, GraphNode>;
}

const END_ID = "end_back_to_list";

export function buildStoryGraph(
  story: GraphInput,
  labels: Record<string, string> = {}
): StoryGraph {
  const nodeIds = Object.keys(story.nodes);
  const startId = story.start_node_id ?? "start";

  // 1) BFS 计算每个节点的最短 layer，并记录首次发现顺序
  const layer: Record<string, number> = { [startId]: 0 };
  const discoverOrder: string[] = [startId];
  const queue: string[] = [startId];
  while (queue.length) {
    const cur = queue.shift()!;
    const node = story.nodes[cur];
    if (!node) continue;
    for (const choice of node.choices) {
      const next = choice.next_node_id;
      if (next === END_ID || !story.nodes[next]) continue;
      if (!(next in layer)) {
        layer[next] = layer[cur] + 1;
        discoverOrder.push(next);
        queue.push(next);
      }
    }
  }

  // 不可达节点（理论上不该有）兜底放到最后一层
  const fallbackLayer = Math.max(0, ...Object.values(layer)) + 1;
  for (const id of nodeIds) {
    if (!(id in layer)) {
      layer[id] = fallbackLayer;
      discoverOrder.push(id);
    }
  }

  // 2) 同层内按发现顺序编 col
  const colCounter: Record<number, number> = {};
  const byId: Record<string, GraphNode> = {};
  const nodes: GraphNode[] = discoverOrder.map((id) => {
    const l = layer[id];
    const col = colCounter[l] ?? 0;
    colCounter[l] = col + 1;
    const node = story.nodes[id];
    const isEnding =
      node.choices.length > 0 &&
      node.choices.every((c) => c.next_node_id === END_ID);
    const g: GraphNode = {
      id,
      layer: l,
      col,
      label: labels[id] ?? id,
      isEnding,
    };
    byId[id] = g;
    return g;
  });

  // 3) 边（剔除指向 end_back_to_list 的）
  const edges: GraphEdge[] = [];
  for (const id of nodeIds) {
    for (const c of story.nodes[id].choices) {
      if (c.next_node_id === END_ID || !story.nodes[c.next_node_id]) continue;
      edges.push({ from: id, to: c.next_node_id });
    }
  }

  const layerCount = Math.max(0, ...nodes.map((n) => n.layer)) + 1;
  const maxLayerWidth = Math.max(1, ...Object.values(colCounter));

  return { nodes, edges, layerCount, maxLayerWidth, byId };
}
