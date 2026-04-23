import type { Metadata } from 'next'
import React from 'react'
import { RecordingPlaybackFeaturePage } from '~/components/RecordingPlaybackFeaturePage'
import { createEnv } from '~/config/env'

void React

export const metadata: Metadata = {
  title: 'Recording and playback',
  description:
    'See how Repro records DOM mutations, interactions, network activity, console output, and performance metrics so every session stays seekable and shareable.',
}

export default function RecordingPlaybackPage() {
  const { REPRO_APP_URL: appUrl } = createEnv(process.env)

  return <RecordingPlaybackFeaturePage appUrl={appUrl} />
}
