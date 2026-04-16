import type { MetadataRoute } from 'next'
import { defaultEnv } from '~/config/env'

// Next.js App Router robots.txt route.
// Allows all crawlers with no disallows; references the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
      },
    ],
    sitemap: `${defaultEnv.REPRO_MARKETING_URL}/sitemap.xml`,
  }
}
