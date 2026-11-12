import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-language";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/en"], disallow: ["/app", "/api"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
