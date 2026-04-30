import type { Metadata } from 'next'
import { IBM_Plex_Mono, Sora } from 'next/font/google'
import type { ReactNode } from 'react'
import { SiteLayout } from '~/components/SiteLayout'
import './globals.css'

const sans = Sora({
  display: 'swap',
  subsets: ['latin'],
  variable: '--marketing-font-sans',
})

const mono = IBM_Plex_Mono({
  display: 'swap',
  subsets: ['latin'],
  variable: '--marketing-font-mono',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Repro — Capture the bug. Let AI find the fix.',
    template: '%s | Repro',
  },
  description:
    'Repro captures sessions so AI can inspect the evidence, find the cause, and hand off the next step.',
  metadataBase: new URL(process.env.REPRO_MARKETING_URL ?? 'https://repro.dev'),
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <SiteLayout>{children}</SiteLayout>
      </body>
    </html>
  )
}
