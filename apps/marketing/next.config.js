/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  env: {
    REPRO_APP_URL: process.env.REPRO_APP_URL ?? 'https://app.repro.dev',
  },

  // Extensibility point: CMS integration (Sanity, Contentlayer) can be added here
  // as a separate Platform issue when content management is needed.

  // Image optimization: promotional assets can be sourced from these domains.
  images: {
    remotePatterns: [],
    unoptimized: true,
  },
}

module.exports = nextConfig
