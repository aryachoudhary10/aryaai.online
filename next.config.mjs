/** @type {import('next').NextConfig} */
const nextConfig = {
  // keep these Node libs out of the webpack bundle for route handlers
  experimental: { serverComponentsExternalPackages: ["web-push", "@upstash/redis"] },
};
export default nextConfig;
