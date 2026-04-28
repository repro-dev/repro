/** @type {import('next').NextConfig} */
const nextConfig = {
  // Extensibility point: CMS integration (Sanity, Contentlayer) can be added here
  // as a separate Platform issue when content management is needed.

  // Image optimization: promotional assets can be sourced from these domains.
  images: {
    remotePatterns: [],
  },
}

module.exports = nextConfig
