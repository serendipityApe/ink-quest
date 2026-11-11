import { Suspense } from "react";
import MyStoriesClient from "./MyStoriesClient";
import MyStoriesView from "./MyStoriesView";

export const dynamic = "error";
export const metadata = { title: "My Stories · InkQuest", robots: { index: false, follow: false } };

// Public static shell only. Private rows are fetched by the signed-in browser under RLS.
export default function MyStoriesPage() {
  return <Suspense fallback={<MyStoriesView stories={[]} page={1} hasMore={false} unavailable={false} pending />}><MyStoriesClient /></Suspense>;
}
