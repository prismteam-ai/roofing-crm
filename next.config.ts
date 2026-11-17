import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server build: this is what runs inside the Lambda container image.
  output: "standalone",
};

export default nextConfig;
