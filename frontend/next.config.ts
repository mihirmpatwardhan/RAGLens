import path from "path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

loadEnvConfig(path.resolve(__dirname, ".."));

const backendOrigin =
  process.env.BACKEND_ORIGIN ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendOrigin.replace(/\/$/, "")}/api/v1/:path*`,
      },
      {
        source: "/docs",
        destination: `${backendOrigin.replace(/\/$/, "")}/docs`,
      },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }],
  },
};

export default nextConfig;
