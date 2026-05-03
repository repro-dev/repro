import type { Metadata } from 'next'
import React from 'react'
import { InstallExtensionPageContent } from '~/components/HighIntentMarketingPages'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Install the extension',
  description:
    'Install Repro in your browser, capture the session that caused the bug, and share the evidence with the team.',
}

export default function InstallExtensionPage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <InstallExtensionPageContent appUrl={appUrl} />
}
