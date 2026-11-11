import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Generation Credits & Pricing",
  description: "Free starter credits, monthly story-generation credits and one-time credit packs for InkQuest.",
  alternates: { canonical: "/subscribe" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
