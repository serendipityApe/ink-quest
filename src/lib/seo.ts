import type { Metadata } from "next";

export const SITE_URL = "https://inkquest.dev";
export const SITE_NAME = "InkQuest";

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
}): Metadata {
  // SVG covers are valid on the site but are not supported by most social cards.
  const socialImage = image && !new URL(image, SITE_URL).pathname.endsWith(".svg")
    ? absoluteUrl(image)
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    robots: { index: !noindex, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      url: absoluteUrl(path),
      ...(socialImage ? { images: [{ url: socialImage, alt: title }] } : {}),
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title: `${title} · ${SITE_NAME}`,
      description,
      ...(socialImage ? { images: [socialImage] } : {}),
    },
  };
}
