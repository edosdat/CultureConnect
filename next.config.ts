import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/api/agenda",
        headers: [
          {
            key: "Cache-Control",
            value:
              "private, no-cache, no-store, max-age=0, must-revalidate",
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
