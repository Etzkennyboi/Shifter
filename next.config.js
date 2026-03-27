/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled — double-mount breaks game loop in dev
  output: 'standalone',   // Optimized for Docker/Railway deployments
}
module.exports = nextConfig
