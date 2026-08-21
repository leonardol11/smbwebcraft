import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@outreach/env",
    "@outreach/db",
    "@outreach/email",
    "@outreach/agents",
    "@outreach/sites",
  ],
  serverExternalPackages: ["@electric-sql/pglite", "pg", "stripe"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
