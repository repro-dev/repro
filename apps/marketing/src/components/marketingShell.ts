import { defaultEnv } from '~/config/env'

export const shellMaxWidth = 1120

export const primaryNavLinks = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/install-extension', label: 'Install Extension' },
  { href: '/blog', label: 'Blog' },
] as const

export const footerGroups = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: '/support', label: 'Support' },
      { href: '/install-extension', label: 'Install extension' },
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
  { href: 'https://github.com/repro-dev', label: 'GitHub' },
  { href: 'https://x.com/reprodev', label: 'X' },
] as const

export const signupHref = defaultEnv.REPRO_APP_URL

export const homepageFeatureHighlights = [
  {
    title: 'Capture the full context',
    body: 'Screenshots, console output, network activity, and device details stay attached to the report.',
  },
  {
    title: 'Share one reproducible link',
    body: 'Everyone opens the same session, so product, support, and engineering stay aligned.',
  },
  {
    title: 'Move from bug to fix faster',
    body: 'The problem, the evidence, and the conversation stay together in one place.',
  },
] as const

export const homepageSocialProof = [
  {
    quote: 'Support, QA, and engineering can all work from the same session.',
    name: 'One shared repro',
    role: 'Less back-and-forth',
  },
  {
    quote: 'A single link replaces screenshots and guesswork.',
    name: 'Clearer handoff',
    role: 'Faster triage',
  },
  {
    quote: 'The evidence stays attached, so fixes move faster.',
    name: 'Better bug reports',
    role: 'Shared context',
  },
] as const

export const homepageDemoChips = [
  { label: 'Captured in', value: '30 s' },
  { label: 'Attached evidence', value: 'Logs + network' },
  { label: 'Shared with', value: 'The whole team' },
] as const

export const placeholderPageContent = {
  about: {
    title: 'About Repro',
    body: 'Learn how Repro helps teams capture better bug reports and move faster.',
  },
  blog: {
    title: 'Blog',
    body: 'Read product updates, launch notes, and stories from the Repro team.',
  },
  changelog: {
    title: 'Changelog',
    body: 'See what shipped recently and what is coming next.',
  },
  contact: {
    title: 'Contact',
    body: 'Reach out to the Repro team for product questions, support, or partnerships.',
  },
  'install-extension': {
    title: 'Install the browser extension',
    body: 'Add Repro to your browser so you can capture issues in a few clicks.',
  },
  features: {
    title: 'Features',
    body: 'Explore the core capture, context, and sharing features behind Repro.',
  },
  pricing: {
    title: 'Pricing',
    body: 'Compare plans and choose the best fit for your team.',
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
    body: 'Find help documentation or contact the team when you get stuck.',
  },
  terms: {
    title: 'Terms of service',
    body: 'Review the terms that govern use of the Repro website and app.',
  },
} as const

export type MarketingRouteSlug = keyof typeof placeholderPageContent

export function isMarketingRouteSlug(slug: string): slug is MarketingRouteSlug {
  return slug in placeholderPageContent
}
