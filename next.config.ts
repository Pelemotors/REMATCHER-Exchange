import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/.well-known/apple-app-site-association",
      headers: [
        { key: "Content-Type", value: "application/json" },
        { key: "Cache-Control", value: "public, max-age=3600" },
      ],
    },
    {
      source: "/.well-known/assetlinks.json",
      headers: [
        { key: "Content-Type", value: "application/json" },
        { key: "Cache-Control", value: "public, max-age=3600" },
      ],
    },
  ],
};

export default nextConfig;
