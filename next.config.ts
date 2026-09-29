import type { NextConfig } from "next";

// Local-first: the default build is a static site (out/) with no server.
// Set NEXT_BASE_PATH=/gosteps when deploying to GitHub Pages under a repo path.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NEXT_BASE_PATH || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
