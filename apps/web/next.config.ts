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
};

export default nextConfig;
