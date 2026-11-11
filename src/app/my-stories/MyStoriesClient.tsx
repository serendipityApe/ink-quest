"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { storyPage } from "@/lib/generation/story-library";
import { createLibraryLoader, pendingLibrary } from "@/lib/generation/story-library-client";
import MyStoriesView from "./MyStoriesView";

export default function MyStoriesClient() {
  const params = useSearchParams();
  const values = params.getAll("page");
  const page = storyPage(values.length > 1 ? values : values[0]);
  const [revision, setRevision] = useState(0);
  return <LibrarySession key={`${page}:${revision}`} page={page} refresh={() => setRevision((value) => value + 1)} />;
}

function LibrarySession({ page, refresh }: { page: number; refresh: () => void }) {
  const router = useRouter();
  const [state, setState] = useState(pendingLibrary);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      queueMicrotask(() => setState({ ...pendingLibrary, pending: false, unavailable: true }));
      return;
    }
    const client = createClient();
    const loader = createLibraryLoader(client, setState);
    let disposed = false;
    let owner: string | null | undefined;
    // INITIAL_SESSION supplies the existing singleton session; no additional
    // getUser roundtrip. RLS, not this client-side ID, is the authorization boundary.
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      const nextOwner = session?.user.id ?? null;
      if (disposed || (owner === nextOwner && event !== "INITIAL_SESSION")) return;
      owner = nextOwner;
      loader.clear(); // Remove previous account's rows before any new query.
      queueMicrotask(() => {
        if (disposed || owner !== nextOwner) return;
        if (!nextOwner) {
          const next = page === 1 ? "/my-stories" : `/my-stories?page=${page}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        void loader.load(nextOwner, page);
      });
    });
    return () => { disposed = true; loader.cancel(); subscription.unsubscribe(); };
  }, [page, router]);

  return <MyStoriesView {...state} page={page}
    refresh={refresh}
    navigate={(nextPage) => window.history.pushState(null, "", nextPage === 1 ? "/my-stories" : `/my-stories?page=${nextPage}`)} />;
}
