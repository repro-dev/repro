/** @type {import('next').NextConfig} */
const nextConfig = {
  // Extensibility point: CMS integration (Sanity, Contentlayer) can be added here
  // as a separate Platform issue when content management is needed.

  // Transpile monorepo workspace packages so Next.js can compile their TypeScript source.
  transpilePackages: ['@repro/design', '@repro/domain', '@repro/analytics'],

  // Image optimization: promotional assets can be sourced from these domains.
  images: {
    remotePatterns: [],
  },
}

module.exports = nextConfig
