import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@fintrack/domain"],
  // monorepo: allow importing from packages
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // native Argon2id binding for password hashing
  serverExternalPackages: ["argon2"],
};

export default nextConfig;
