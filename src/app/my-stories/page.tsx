import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { STORY_PAGE_SIZE, storyPage } from "@/lib/generation/story-library";
import MyStoriesClient from "./MyStoriesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Stories · InkQuest", robots: { index: false, follow: false } };

export default async function MyStoriesPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login?next=/my-stories");
  const page = storyPage((await searchParams).page);
  const supabase = await createClient();
  // Session-scoped client + explicit owner filter. Never expose private stories
  // through the public curated catalog or an administrator client.
  const { data, error } = await supabase.from("generated_stories")
    .select("id,title,target_language,learner_level,status,current_node_id,created_at,updated_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * STORY_PAGE_SIZE, page * STORY_PAGE_SIZE);
  const rows = error ? [] : data ?? [];
  return <MyStoriesClient stories={rows.slice(0, STORY_PAGE_SIZE)} page={page}
    hasMore={rows.length > STORY_PAGE_SIZE} unavailable={Boolean(error)} />;
}
