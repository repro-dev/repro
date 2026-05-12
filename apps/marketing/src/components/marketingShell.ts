export const signupHref = '/coming-soon'

export const primaryNavLinks = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: signupHref, label: 'Log in' },
] as const

export const footerGroups = [
  {
    title: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
      { href: signupHref, label: 'Log in' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
] as const

export const homepageHeroMock = {
  eyebrow: 'Bug reports for coding agents',
  headline: 'Record the bug. Let AI find the fix.',
  lede: 'Repro captures the clicks, errors, and network requests behind a bug so coding agents can fix it faster.',
  primaryCta: 'Get started for free',
  secondaryCta: 'See how it works',
} as const

export const homepageProofCards = [
  {
    tone: 'info',
    body: 'Clicks and user interactions',
  },
  {
    tone: 'success',
    body: 'Console logs and errors',
  },
  {
    tone: 'warning',
    body: 'Network requests and WebSockets',
  },
  {
    tone: 'danger',
    body: 'Replay timeline and DOM state',
  },
] as const

export const routePageContent = {
  privacy: {
    title: 'Privacy policy',
    body: 'Read how Repro handles customer data, recordings, and privacy.',
  },
  support: {
    title: 'Support',
    body: 'Get help with recordings, replayable bug reports, agentic debugging, account access, or billing.',
  },
  terms: {
    title: 'Terms of service',
    body: 'Review the terms that apply to using the Repro site and app.',
  },
} as const

export type MarketingRouteSlug = keyof typeof routePageContent

export function isMarketingRouteSlug(slug: string): slug is MarketingRouteSlug {
  return slug in routePageContent
}
