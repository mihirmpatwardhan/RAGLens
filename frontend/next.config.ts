import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone for Docker deployments
  output: "standalone",

  // Proxy API requests to FastAPI backend
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8000/api/v1/:path*",
      },
      {
        source: "/docs",
        destination: "http://localhost:8000/docs",
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
