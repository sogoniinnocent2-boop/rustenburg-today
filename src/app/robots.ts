import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.rustenburgtoday.co.za").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/department", "/account", "/auth/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
