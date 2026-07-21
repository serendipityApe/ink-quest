import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "./env";

export { isSupabaseConfigured } from "./env";

export function createClient() {
  const { url, anonKey } = getSupabaseBrowserEnv();
  return createBrowserClient(url, anonKey);
}
