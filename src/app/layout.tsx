import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { siteUrl } from "@/lib/site-language";
import "./globals.css";

// 在首帧渲染前定好主题，避免刷新时先白后黑
const themeScript = `(function(){try{var s=localStorage.getItem('jojobot-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Cloud Puffer",
  description: "连接网页、聊天渠道与本地 Agent 的开源 AI 助手。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#11171c" },
  ],
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale =
    requestHeaders.get("x-jojobot-language") ??
    (await cookies()).get("jojobot-language")?.value;
  return (
    <html lang={locale === "en" ? "en" : "zh-CN"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
