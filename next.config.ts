import type { NextConfig } from "next";

const config: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Match uploads are sent to a route handler in chunks, not as one body.
    proxyTimeout: 120_000,
  },
};

export default config;
