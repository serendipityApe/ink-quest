/** Public reading entry points; keep this module safe for client components. */
export const DEFAULT_STORY_ID = "the-borrowed-sect-1";
export const DEFAULT_STORY_HREF = `/stories/${DEFAULT_STORY_ID}`;

/** Exclude withdrawn demos from navigation without deleting saved progress. */
export const WITHDRAWN_STORY_IDS: ReadonlySet<string> = new Set([
  "master-secret",
  "last-train",
]);
