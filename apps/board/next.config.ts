import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-gc/protocol"],
  reactStrictMode: true,
};

export default nextConfig;
