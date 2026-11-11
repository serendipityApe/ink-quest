export const STORY_PAGE_SIZE = 20;

export function storyPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value)) return 1;
  return Number(value);
}

export interface SavedStory {
  id: string;
  title: string | null;
  target_language: string;
  learner_level: string;
  status: string;
  current_node_id: string | null;
  created_at: string;
  updated_at: string;
}

export function storyStatus(status: string, zh: boolean): string {
  const labels: Record<string, [string, string]> = {
    draft: ["已保存，等待生成", "Saved · waiting"],
    generating: ["正在生成", "Generating"],
    active: ["可继续阅读", "Ready to read"],
    paused: ["已暂停", "Paused"],
    archived: ["已归档", "Archived"],
    failed: ["生成未完成", "Generation incomplete"],
  };
  return labels[status]?.[zh ? 0 : 1] ?? (zh ? "已保存" : "Saved");
}
