import type { Metadata } from 'next'
import { IBM_Plex_Mono, Noto_Sans, Sora } from 'next/font/google'
import type { ReactNode } from 'react'
import { SiteLayout } from '~/components/SiteLayout'
import './globals.css'

const display = Sora({
  display: 'swap',
  subsets: ['latin'],
  variable: '--marketing-font-display',
})

const sans = Noto_Sans({
  display: 'swap',
  subsets: ['latin'],
  variable: '--marketing-font-sans',
  weight: ['400', '500', '600', '700'],
})

const mono = IBM_Plex_Mono({
  display: 'swap',
  subsets: ['latin'],
  variable: '--marketing-font-mono',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Repro — Record the bug. Let AI find the fix.',
    template: '%s | Repro',
  },
  description:
    'Repro creates replayable bug reports with clicks, errors, and network requests so coding agents can fix problems faster.',
  metadataBase: new URL(process.env.REPRO_MARKETING_URL ?? 'https://repro.dev'),
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <SiteLayout>{children}</SiteLayout>
      </body>
    </html>
  )
}
/* eslint-enable */
