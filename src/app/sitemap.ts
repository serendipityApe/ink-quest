import type { MetadataRoute } from "next";
import { listCards } from "@/lib/stories/registry";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/stories`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/stories?target=en`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/refund`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const storyRoutes: MetadataRoute.Sitemap = listCards().filter((story) => !story.locked).map((story) => ({
    url: `${SITE_URL}/stories/${story.id}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...storyRoutes];
}
