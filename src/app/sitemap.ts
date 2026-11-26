import type { MetadataRoute } from "next";
import { sections } from "@/lib/sections";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.rustenburgtoday.co.za").replace(/\/$/, "");
  const locales = ["en", "tn", "af"] as const;
  const staticPaths = ["", "/news", "/news/official", "/search", "/auth/sign-in", "/auth/sign-up", "/legal/terms", "/legal/privacy"];
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const path of staticPaths) {
      entries.push({
        url: `${site}/${locale}${path}`,
        changeFrequency: path === "" ? "hourly" : "daily",
        priority: path === "" ? 1 : 0.7,
      });
    }
    for (const section of sections) {
      if (["ask", "briefing", "map", "productivity"].includes(section.slug)) continue;
      entries.push({
        url: `${site}/${locale}/${section.slug}`,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  }
  return entries;
}
