import { defaultEnv } from '~/config/env'

// JSON-LD structured data helpers for schema.org types.
// Plain typed objects — schema-dts is not installed in this package.

export interface JsonLdBase {
  '@context': 'https://schema.org'
  '@type': string
  [key: string]: unknown
}

/**
 * Returns a schema.org Organization JSON-LD object for Repro.
 */
export function buildOrganizationJsonLd(): JsonLdBase {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Repro',
    url: defaultEnv.REPRO_MARKETING_URL,
    logo: `${defaultEnv.REPRO_MARKETING_URL}/logo.png`,
    sameAs: ['https://twitter.com/reprodev', 'https://github.com/repro-dev'],
  }
}

/**
 * Returns a schema.org WebSite JSON-LD object with a SearchAction.
 */
export function buildWebSiteJsonLd(url: string): JsonLdBase {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url,
    name: 'Repro',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${url}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}
