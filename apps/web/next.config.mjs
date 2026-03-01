/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
  // ESLint is run as a dedicated CI step; skip it during next build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
