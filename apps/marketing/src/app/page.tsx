import type { Metadata } from 'next'
import React from 'react'
import { HomePageContent } from '~/components/HomePageContent'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Record the bug. Let AI find the fix.',
  description:
    'Repro creates replayable bug reports with clicks, errors, and network requests so coding agents can fix problems faster.',
}

export default function HomePage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <HomePageContent appUrl={appUrl} />
}
