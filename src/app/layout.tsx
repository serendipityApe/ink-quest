import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";

export const metadata: Metadata = {
  title: "InkQuest - Learn Chinese through Interactive Web Novels",
  description: "Ditch boring textbooks. Learn real, idiomatic Chinese through immersive Xianxia, Sci-Fi, and Cyberpunk interactive web novels.",
  keywords: ["Mandarin", "Learn Chinese", "Interactive Fiction", "Web Novels", "Xianxia", "Cyberpunk", "HSK"],
  authors: [{ name: "InkQuest Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-on-background selection:bg-primary-container selection:text-white">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
