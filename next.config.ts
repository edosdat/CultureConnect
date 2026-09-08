import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
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
