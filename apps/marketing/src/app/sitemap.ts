import type { MetadataRoute } from 'next'
import { defaultEnv } from '~/config/env'

// Next.js App Router sitemap.xml route.
// Static entries for all public marketing pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = defaultEnv.REPRO_MARKETING_URL

  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/refund-policy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]
}
