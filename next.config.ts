import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (only traced node_modules).
  output: "standalone",
  // Pin the project root (a lockfile further up the tree would otherwise be picked).
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // The dev badge would sit on top of the navigation's bottom controls.
  devIndicators: false,
  // next/image optimization is unused, so its native `sharp` binaries (~33 MB) stay out.
  outputFileTracingExcludes: { "*": ["node_modules/@img/**", "node_modules/sharp/**"] },
  async headers() {
    return [
      {
        source: "/duckdb/:path*",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/monaco/:version/vs/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
