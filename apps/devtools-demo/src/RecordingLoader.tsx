import {
  PlaybackFromSourceProvider,
  Source,
  createFixtureSource,
  createNullSource,
} from '@repro/playback'
import React, { PropsWithChildren, useEffect, useState } from 'react'
import { FileLoader } from './FileLoader'
import { createFileSource } from './createFileSource'

function getFixtureId() {
  const path = location.pathname.split('/').filter(segment => segment !== '')
  return path[0] ?? null
}

export const RecordingLoader: React.FC<PropsWithChildren> = ({ children }) => {
  const [fixtureId] = useState<string | null>(getFixtureId)
  const [ready, setReady] = useState(false)
  const [source, setSource] = useState<Source>(createNullSource)

  const isAwaitingFileLoad = !ready && fixtureId == null

  useEffect(() => {
    if (fixtureId != null) {
      setSource(createFixtureSource(`/sources/${fixtureId}.repro`))
      setReady(true)
    }
  }, [fixtureId, setSource])

  return (
    <>
      {isAwaitingFileLoad && (
        <FileLoader
          onLoad={file => {
            setSource(createFileSource(file))
            setReady(true)
          }}
        />
      )}

      <PlaybackFromSourceProvider source={source}>
        {ready && children}
      </PlaybackFromSourceProvider>
    </>
  )
}
