import type { Metadata } from "next";
import { Inter, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "CyberMandarin (InkQuest) - Learn Chinese through Interactive Web Novels",
  description: "Ditch boring textbooks. Learn real, idiomatic Chinese through immersive Xianxia, Sci-Fi, and Cyberpunk interactive web novels.",
  keywords: ["Mandarin", "Learn Chinese", "Interactive Fiction", "Web Novels", "Xianxia", "Cyberpunk", "HSK"],
  authors: [{ name: "CyberMandarin Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-on-background selection:bg-primary-container selection:text-white">
        {children}
      </body>
    </html>
  );
}
