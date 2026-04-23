import type { Metadata } from 'next'
import React from 'react'
import { SiteLayout } from '~/components/SiteLayout'
import './globals.css'
import { JsxstyleRegistry } from './JsxstyleRegistry'

export const metadata: Metadata = {
  title: {
    default: 'Repro — Bug reporting that captures every detail',
    template: '%s | Repro',
  },
  description:
    'Repro automatically captures sessions so your team can reproduce and fix bugs faster.',
  metadataBase: new URL(process.env.REPRO_MARKETING_URL ?? 'https://repro.dev'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <JsxstyleRegistry>
          <SiteLayout>{children}</SiteLayout>
        </JsxstyleRegistry>
      </body>
    </html>
  )
}
