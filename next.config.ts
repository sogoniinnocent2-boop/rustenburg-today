import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  serverExternalPackages: [],
  webpack: (config, { isServer, dev }) => {
    if (isServer && !dev) {
      config.plugins.push({
        apply(compiler: { hooks: { afterEmit: { tap: (name: string, callback: () => void) => void } } }) {
          compiler.hooks.afterEmit.tap("bundle-server-data", () => {
            const dest = path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next", "server");
            fs.mkdirSync(dest, { recursive: true });
            fs.copyFileSync(path.join(process.cwd(), "src", "server", "schema.sql"), path.join(dest, "schema.sql"));
            if (process.env.BUNDLE_SNAPSHOT === "1") {
              const database = path.join(process.cwd(), "data", "rustenburg.db");
              if (fs.existsSync(database)) fs.copyFileSync(database, path.join(dest, "rustenburg.db"));
              const uploads = path.join(process.cwd(), "data", "uploads");
              if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dest, "uploads-snapshot"), { recursive: true });
            }
          });
        },
      });
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
              "media-src 'self' blob: https:",
              "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://player.mux.com",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "connect-src 'self' https://*.tile.openstreetmap.org",
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
