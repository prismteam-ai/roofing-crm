import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `pg` and the MCP SDK are Node-only; keep them out of the client bundle.
  serverExternalPackages: ["pg", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
