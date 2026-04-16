import type { MetadataRoute } from 'next'
import { defaultEnv } from '~/config/env'

// Next.js App Router sitemap.xml route.
// Static entries for all public marketing pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = defaultEnv.REPRO_MARKETING_URL

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
