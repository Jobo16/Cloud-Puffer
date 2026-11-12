import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-language";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      alternates: {
        languages: { "zh-CN": `${siteUrl}/`, en: `${siteUrl}/en` },
      },
    },
    {
      url: `${siteUrl}/en`,
      alternates: {
        languages: { "zh-CN": `${siteUrl}/`, en: `${siteUrl}/en` },
      },
    },
  ];
}
