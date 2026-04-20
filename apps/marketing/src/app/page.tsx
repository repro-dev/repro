import type { Metadata } from 'next'
import React from 'react'
import { HeroSection } from '~/components/HeroSection'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Bug reporting that captures every detail',
}

export default function HomePage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <HeroSection appUrl={appUrl} />
}
