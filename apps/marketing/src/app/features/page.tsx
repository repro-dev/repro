import type { Metadata } from 'next'
import React from 'react'
import { FeaturesPageContent } from '~/components/HighIntentMarketingPages'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Features',
  description:
    'See how Repro captures evidence, replays the session, and hands off the fix with grounded AI diagnosis.',
}

export default function FeaturesPage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <FeaturesPageContent appUrl={appUrl} />
}
