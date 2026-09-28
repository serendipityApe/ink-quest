import HomeClient from "./HomeClient";
import { pageMetadata } from "@/lib/seo";

export const metadata = {
  ...pageMetadata({
  title: "Learn Chinese through Interactive Stories",
  description: "Read Chinese stories for HSK 3–5 learners. Explore xianxia, mystery, romance and science fiction with word lookup, audio and choices that shape the story.",
  path: "/",
  }),
  // Public verification token issued by Search Console for https://inkquest.dev/.
  verification: { google: "hclfm0c0RpipJiZCJGS3Eu72ZP418xo-rpMk2b-Rrxk" },
};

export default function HomePage() {
  return <HomeClient />;
}
