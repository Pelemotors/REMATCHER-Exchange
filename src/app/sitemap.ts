import type { MetadataRoute } from "next";
import { CANONICAL_APP_URL } from "@/config/app";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = CANONICAL_APP_URL;
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
