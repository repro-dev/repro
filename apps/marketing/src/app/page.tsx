import type { Metadata } from 'next'
import React from 'react'
import { HomePageContent } from '~/components/HomePageContent'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Capture the bug. Let AI find the fix.',
  description:
    'Repro captures the session so AI can inspect the evidence, find the cause, and hand off the next step.',
}

export default function HomePage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <HomePageContent appUrl={appUrl} />
}
