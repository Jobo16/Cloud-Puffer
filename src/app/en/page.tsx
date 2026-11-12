import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { siteMetadata, siteUrl } from "@/lib/site-language";

export const metadata: Metadata = {
  title: siteMetadata.en.title,
  description: siteMetadata.en.description,
  robots: { index: true, follow: true },
  alternates: {
    canonical: siteMetadata.en.path,
    languages: { "zh-CN": "/", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: siteMetadata.en.title,
    description: siteMetadata.en.description,
    url: `${siteUrl}/en`,
    siteName: "Cloud Puffer",
    locale: "en_US",
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
    title: siteMetadata.en.title,
    description: siteMetadata.en.description,
    images: ["/brand-avatar.webp"],
  },
};

export default async function EnglishHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <Landing
      language="en"
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
