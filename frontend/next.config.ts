import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The dev server blocks cross-origin requests to dev assets/HMR by default.
  // Allow Cloudflare quick-tunnel hostnames so the app is usable through cloudflared.
  allowedDevOrigins: ['*.trycloudflare.com', '**.trycloudflare.com', '127.0.0.1'],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
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
