import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read live data from Postgres on every request (see src/app/layout.tsx),
  // so the Cache Components model is not used.
  cacheComponents: false,
  serverExternalPackages: ["exceljs", "@electric-sql/pglite"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.cricheroes.in" },
      { protocol: "https", hostname: "images.cricheroes.in" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
