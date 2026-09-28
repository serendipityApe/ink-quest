import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Also cover the generator's anonymous redirect, which has no HTML metadata.
    return ["/generate/:path*", "/subscribe/:path*", "/login", "/saved-words"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        // Supabase Storage public bucket：故事封面（生产环境）
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
