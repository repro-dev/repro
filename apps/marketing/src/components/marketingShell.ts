import { defaultEnv } from '~/config/env'

export const signupHref = defaultEnv.REPRO_APP_URL

export const primaryNavLinks = [
  { href: '/features', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: signupHref, label: 'Log in' },
] as const

export const footerGroups = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
      { href: signupHref, label: 'Log in' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/refund-policy', label: 'Refund policy' },
    ],
  },
] as const

export const homepageHeroMock = {
  eyebrow: 'Replayable bug reports for coding agents',
  headline: 'Record the bug. Let AI find the fix.',
  lede: 'Repro captures the clicks, errors, and network requests behind a bug so coding agents can fix it faster.',
  primaryCta: 'Get started for free',
  secondaryCta: 'See how it works',
  labelRow: {
    left: 'recorded evidence',
    right: 'AI finds the cause',
  },
  transcriptRows: [
    {
      label: 'capture',
      body: 'Record the full session before the issue disappears.',
    },
    {
      label: 'analyze',
      body: 'Let AI inspect the replay instead of guessing from logs.',
    },
    {
      label: 'handoff',
      body: 'Turn the diagnosis into a compact fix brief.',
    },
  ],
  cards: [
    { title: 'Session', body: 'Keep the evidence' },
    { title: 'Replay', body: 'Let AI inspect it' },
    { title: 'Brief', body: 'Share the next step' },
  ],
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

export const homepageNarrativeCards = [
  {
    kicker: 'Record',
    title: 'Record the bug before the evidence is lost.',
    body: 'Preserve the interactions and evidence that explain what happened.',
  },
  {
    kicker: 'Evidence, not guesswork',
    title: 'Give each bug a clear trail of evidence.',
    body: 'Replay the session alongside the logs, requests, and interactions that explain the behaviour.',
  },
  {
    kicker: 'Fix faster',
    title: 'Give coding agents what they need to fix the problem.',
    body: 'Send the replayable report to your coding agent with the evidence needed to diagnose, patch, and verify.',
  },
] as const

export const routePageContent = {
  about: {
    title: 'About Repro',
    body: 'Learn why Repro exists: to make bug reports replayable, reproducible, and useful to the people fixing them.',
  },
  contact: {
    title: 'Contact',
    body: 'Contact Repro about product questions, support, partnerships, or early access.',
  },
  privacy: {
    title: 'Privacy policy',
    body: 'Read how Repro handles customer data, recordings, and privacy.',
  },
  'refund-policy': {
    title: 'Refund policy',
    body: 'Review refund terms for self-serve plans and sales-assisted purchases.',
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
