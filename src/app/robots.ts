import type { MetadataRoute } from "next";
import { CANONICAL_APP_URL } from "@/config/app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/dealer/", "/home", "/matches", "/agent"],
    },
    sitemap: `${CANONICAL_APP_URL}/sitemap.xml`,
  };
}
