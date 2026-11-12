import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { siteMetadata, siteUrl } from "@/lib/site-language";
export const metadata: Metadata = {
  title: siteMetadata.zh.title,
  description: siteMetadata.zh.description,
  robots: { index: true, follow: true },
  alternates: {
    canonical: siteMetadata.zh.path,
    languages: { "zh-CN": "/", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: siteMetadata.zh.title,
    description: siteMetadata.zh.description,
    url: `${siteUrl}/`,
    siteName: "Cloud Puffer",
    locale: "zh_CN",
    type: "website",
    images: [
      {
        url: "/brand-avatar.webp",
        width: 256,
        height: 256,
        alt: "Cloud Puffer",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteMetadata.zh.title,
    description: siteMetadata.zh.description,
    images: ["/brand-avatar.webp"],
  },
};
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <Landing
      language="zh"
      openAuth={
        typeof params.auth === "string" ||
        typeof params.token === "string" ||
        Boolean(params.error)
      }
      token={typeof params.token === "string" ? params.token : undefined}
      linkError={Boolean(params.error)}
    />
  );
}
