import type { SupabaseClient } from "@supabase/supabase-js";
import { STORY_PAGE_SIZE, type SavedStory } from "./story-library";

export type LibraryState = { stories: SavedStory[]; hasMore: boolean; pending: boolean; unavailable: boolean };
export const pendingLibrary: LibraryState = { stories: [], hasMore: false, pending: true, unavailable: false };

// Per mounted screen, never a global cache. Epoch fencing also covers transports
// that complete despite abort, account changes, refreshes, and unmounts.
export function createLibraryLoader(client: SupabaseClient, publish: (state: LibraryState) => void) {
  let epoch = 0;
  let abort: AbortController | undefined;
  const cancel = () => { epoch++; abort?.abort(); };
  return {
    cancel,
    clear() { cancel(); publish(pendingLibrary); },
    async load(ownerId: string, page: number) {
      cancel();
      const current = epoch;
      abort = new AbortController();
      publish(pendingLibrary);
      try {
        const { data, error } = await client.from("generated_stories")
          .select("id,title,target_language,learner_level,status,current_node_id,created_at,updated_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false }).order("id", { ascending: false })
          .range((page - 1) * STORY_PAGE_SIZE, page * STORY_PAGE_SIZE)
          .abortSignal(abort.signal);
        if (current !== epoch) return;
        if (error) throw error;
        const rows = data ?? [];
        publish({ stories: rows.slice(0, STORY_PAGE_SIZE), hasMore: rows.length > STORY_PAGE_SIZE, pending: false, unavailable: false });
      } catch {
        if (current === epoch) publish({ stories: [], hasMore: false, pending: false, unavailable: true });
      }
    },
  };
}
