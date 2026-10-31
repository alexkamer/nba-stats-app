import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Lets other devices on the LAN load dev assets/API routes — next dev
  // otherwise 403s any cross-origin request not from localhost/the
  // hostname it was started with (see allowedDevOrigins docs).
  allowedDevOrigins: ["192.168.0.*"],
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
