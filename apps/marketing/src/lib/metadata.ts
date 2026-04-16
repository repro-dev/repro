import type { Metadata } from 'next'
import { defaultEnv } from '~/config/env'

// Site-wide metadata defaults used as the base for all pages.
// Per-page metadata should call buildPageMetadata() with overrides.
export const defaultMetadata: Metadata = {
  title: {
    default: 'Repro — Bug reporting that captures every detail',
    template: '%s | Repro',
  },
  description:
    'Repro automatically captures sessions so your team can reproduce and fix bugs faster — without the back-and-forth.',
  metadataBase: new URL(defaultEnv.REPRO_MARKETING_URL),
  openGraph: {
    type: 'website',
    siteName: 'Repro',
    images: [
      {
        url: `${defaultEnv.REPRO_MARKETING_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Repro — Bug reporting that captures every detail',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [`${defaultEnv.REPRO_MARKETING_URL}/og-image.png`],
  },
  alternates: {
    canonical: defaultEnv.REPRO_MARKETING_URL,
  },
}

/**
 * Merge site-wide defaults with per-page overrides.
 * Returns a new Metadata object — never mutates defaultMetadata.
 */
export function buildPageMetadata(overrides?: Partial<Metadata>): Metadata {
  if (overrides === undefined) {
    return defaultMetadata
  }

  return {
    ...defaultMetadata,
    ...overrides,
    // Deep-merge openGraph so callers can override individual fields
    openGraph:
      overrides.openGraph !== undefined
        ? { ...defaultMetadata.openGraph, ...overrides.openGraph }
        : defaultMetadata.openGraph,
    // Deep-merge twitter similarly
    twitter:
      overrides.twitter !== undefined
        ? { ...defaultMetadata.twitter, ...overrides.twitter }
        : defaultMetadata.twitter,
  }
}
