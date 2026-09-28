import HomeClient from "./HomeClient";
import { pageMetadata } from "@/lib/seo";
import { loadStory, nodeResponse } from "@/lib/stories/registry";
import { DEFAULT_STORY_ID } from "@/lib/stories/entry-points";

export const metadata = {
  ...pageMetadata({
  title: "Learn Chinese through Interactive Stories",
  description: "Read Chinese stories for HSK 3–5 learners. Explore xianxia, mystery, romance and science fiction with word lookup, audio and choices that shape the story.",
  path: "/",
  }),
  // Public verification token issued by Search Console for https://inkquest.dev/.
  verification: { google: "hclfm0c0RpipJiZCJGS3Eu72ZP418xo-rpMk2b-Rrxk" },
};

export default async function HomePage() {
  const story = await loadStory(DEFAULT_STORY_ID);
  const node = story && nodeResponse(story, "wheel");
  if (!node?.audio_url) throw new Error("Homepage demo audio is missing");

  const sentenceEnd = node.text_segments.findIndex((segment) => segment.word === "。");
  if (sentenceEnd < 0 || node.timestamps.length <= sentenceEnd) {
    throw new Error("Homepage demo sentence or timestamps are missing");
  }

  return (
    <HomeClient
      demoAudioUrl={node.audio_url}
      demoSegments={node.text_segments.slice(0, sentenceEnd + 1)}
      demoTimestamps={node.timestamps.slice(0, sentenceEnd + 1)}
    />
  );
}
