import { defaultEnv } from '~/config/env'

export const signupHref = defaultEnv.REPRO_APP_URL

export const primaryNavLinks = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: signupHref, label: 'Sign up' },
] as const

export const footerGroups = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: signupHref, label: 'Sign up' },
    ],
  },
  {
    title: 'Workflow',
    links: [
      { href: '/install-extension', label: 'Capture setup' },
      { href: '/blog', label: 'Replay notes' },
      { href: '/changelog', label: 'Fix log' },
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

export const socialLinks = [
  { href: '/github', label: 'GitHub' },
  { href: '/x', label: 'X' },
] as const

export const homepageHeroMock = {
  eyebrow: 'Capture / AI / find / fix',
  headline: 'Capture the bug. Let AI find the fix.',
  lede: 'One recorded session gives the agent the evidence to diagnose and hand off the next step.',
  primaryCta: 'Start free',
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
    body: 'The page keeps the story simple: capture, inspect, resolve.',
  },
  {
    tone: 'success',
    body: 'Teams keep the same evidence in front of support and engineering.',
  },
  {
    tone: 'warning',
    body: 'Short section copy supports the distilled message.',
  },
  {
    tone: 'danger',
    body: 'The conversion path stays signup-oriented.',
  },
] as const

export const homepageNarrativeCards = [
  {
    kicker: 'Capture',
    title: 'Record the bug before the context is gone.',
    body: 'Keep the session and the important UI changes together.',
  },
  {
    kicker: 'AI finds',
    title: 'Let the agent find the fix.',
    body: 'Use the replay to narrow the path from symptom to remedy.',
  },
  {
    kicker: 'Fix',
    title: 'Make the handoff easy.',
    body: 'Share a crisp summary that engineers can act on.',
  },
] as const

export const routePageContent = {
  about: {
    title: 'About Repro',
    body: 'Learn how Repro turns recorded evidence into a faster fix handoff.',
  },
  blog: {
    title: 'Blog',
    body: 'Read notes on capture, replay, and the AI-assisted fix path.',
  },
  changelog: {
    title: 'Changelog',
    body: 'See what shipped across capture, evidence, and fix handoffs.',
  },
  contact: {
    title: 'Contact',
    body: 'Reach out about product questions, support, or partnerships.',
  },
  privacy: {
    title: 'Privacy policy',
    body: 'Read how Repro handles customer data and recording privacy.',
  },
  'refund-policy': {
    title: 'Refund policy',
    body: 'Review refund terms for self-serve and sales-assisted purchases.',
  },
  support: {
    title: 'Support',
    body: 'Get help when a session needs more evidence or a sharper handoff.',
  },
  terms: {
    title: 'Terms of service',
    body: 'Review the rules for using the Repro site and app.',
  },
} as const

export type MarketingRouteSlug = keyof typeof routePageContent

export function isMarketingRouteSlug(slug: string): slug is MarketingRouteSlug {
  return slug in routePageContent
}
