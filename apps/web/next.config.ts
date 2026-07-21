import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@fintrack/domain"],
  // monorepo: allow importing from packages
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
