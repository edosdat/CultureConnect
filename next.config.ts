import type { NextConfig } from "next";

/** Keep in sync with PUBLIC_REVALIDATE_CACHE_CONTROL in src/lib/httpCache.ts */
const PUBLIC_REVALIDATE_CACHE_CONTROL =
  "public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=300";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: PUBLIC_REVALIDATE_CACHE_CONTROL,
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/spectacle/:path*",
        destination:
          "https://festivalramonville-arto.fr/programmation/spectacle/:path*",
        permanent: false,
      },
      {
        source: "/programmation/:path*",
        destination: "https://festivalramonville-arto.fr/programmation/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
