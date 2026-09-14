import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Make the serverless/standalone functions wait up to 120s for long-running
  // API routes (Intron STT sync can take ~12s; the benchmark can take ~60s).
  serverExternalPackages: ["@prisma/client", "z-ai-web-dev-sdk"],
};

export default nextConfig;
