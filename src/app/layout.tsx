import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";
import GoogleOneTap from "@/components/GoogleOneTap";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://inkquest.dev"),
  title: {
    default: "InkQuest — Learn Chinese through Interactive Stories",
    template: "%s · InkQuest",
  },
  description: "Read levelled Chinese stories, tap words for definitions, hear each line, and choose what happens next.",
  keywords: ["Mandarin", "Learn Chinese", "Interactive Fiction", "Web Novels", "Xianxia", "Cyberpunk", "HSK"],
  authors: [{ name: "InkQuest Team" }],
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-on-background selection:bg-primary-container selection:text-on-primary-container">
        <I18nProvider>
          {children}
          <GoogleOneTap />
        </I18nProvider>
      </body>
    </html>
  );
}
