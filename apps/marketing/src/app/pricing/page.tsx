import type { Metadata } from 'next'
import React from 'react'
import { PricingPageContent } from '~/components/HighIntentMarketingPages'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Choose the Repro plan that fits your team’s capture-to-fix workflow and AI usage needs.',
}

export default function PricingPage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <PricingPageContent appUrl={appUrl} />
}
