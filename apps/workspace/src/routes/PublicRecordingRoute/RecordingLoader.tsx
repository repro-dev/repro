import { useApiClient } from '@repro/api-client'
import {
  PlaybackFromSourceProvider,
  Source,
  createNullSource,
} from '@repro/playback'
import { createApiSource } from '@repro/recording-api'
import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react'

function getRecordingId() {
  const path = location.href
    // Strip leading app base URL
    .replace(process.env.REPRO_APP_URL ?? '', '')
    // Strip trailing hash (encryption key)
    .replace(/#.*$/, '')
    .split('/')
    .filter(segment => segment !== '')
  return path[0] ?? null
}

function getEncryptionKey() {
  return location.hash.replace(/^#/, '')
}

export const RecordingLoader: React.FC<PropsWithChildren> = ({ children }) => {
  const recordingId = useMemo(getRecordingId, [])
  const encryptionKey = useMemo(getEncryptionKey, [])

  const [source, setSource] = useState<Source>(createNullSource)
  const apiClient = useApiClient()

  useEffect(() => {
    if (recordingId != null) {
      setSource(createApiSource(recordingId, apiClient, { encryptionKey }))
    }
  }, [recordingId, encryptionKey, apiClient, setSource])

  return (
    <PlaybackFromSourceProvider source={source}>
      {children}
    </PlaybackFromSourceProvider>
  )
}
