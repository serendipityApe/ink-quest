import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Founding Reader Subscription & Pricing",
  description: "Monthly Founding Reader membership, billing terms and subscription pricing for InkQuest.",
  alternates: { canonical: "/subscribe" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
