import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (only traced node_modules).
  output: "standalone",
  // Pin the project root (a lockfile further up the tree would otherwise be picked).
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      // y-monaco imports Monaco's ESM build (2.5 MB raw) only for Range/Selection; the editor
      // already loads Monaco AMD from /monaco/<version>/vs, so hand it the loaded instance.
      "monaco-editor/esm/vs/editor/editor.api.js": "./src/lib/monaco-global.ts",
    },
  },
  // The dev badge would sit on top of the navigation's bottom controls.
  devIndicators: false,
  // Keep the standalone server output to the server's own code: next/image is unused (so its
  // native `sharp` binaries stay out), `public` and `.next/static` are copied separately by
  // the Dockerfile, and the rest is source, tests, fixtures or runtime data.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@img/**",
      "node_modules/sharp/**",
      "public/**",
      "src/**",
      "e2e/**",
      "test/**",
      "docs/**",
      "fixtures/**",
      "sample/**",
      "snowflake_screenahots/**",
      ".querypad-data/**",
    ],
  },
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
