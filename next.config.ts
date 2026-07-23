import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === 'true';
const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: 'export',
        trailingSlash: true,
        basePath: isProd ? '/browseio' : '',
      }
    : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
