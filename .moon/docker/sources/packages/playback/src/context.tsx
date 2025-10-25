import { useAtomValue } from '@repro/atom'
import { Card, FX } from '@repro/design'
import { AlertTriangleIcon, LoaderIcon } from 'lucide-react'
import React, { PropsWithChildren, useEffect, useState } from 'react'
import { EMPTY_PLAYBACK, createSourcePlayback } from './createSourcePlayback'
import { Playback, Source } from './types'

export const PlaybackContext = React.createContext<Playback | null>(null)

interface PlaybackProviderProps {
  playback: Playback | null
  startTime?: number
  startIndex?: number
}

export const PlaybackProvider: React.FC<
  PropsWithChildren<PlaybackProviderProps>
> = ({ children, playback, startIndex, startTime = 0 }) => {
  useEffect(() => {
    if (playback) {
      playback.open()

      if (startIndex != null) {
        playback.seekToEvent(startIndex)
      } else {
        playback.seekToTime(startTime)
      }
    }

    return () => {
      if (playback) {
        playback.close()
      }
    }
  }, [playback, startIndex, startTime])

  return (
    <PlaybackContext.Provider value={playback}>
      {children}
    </PlaybackContext.Provider>
  )
}

interface PlaybackFromSourceProviderProps {
  source: Source
}

export const PlaybackFromSourceProvider: React.FC<
  PropsWithChildren<PlaybackFromSourceProviderProps>
> = ({ children, source }) => {
  const events = useAtomValue(source.$events)
  const duration = useAtomValue(source.$duration)
  const resourceMap = useAtomValue(source.$resourceMap)
  const readyState = useAtomValue(source.$readyState)
  const [playback, setPlayback] = useState(EMPTY_PLAYBACK)

  useEffect(() => {
    if (readyState === 'ready') {
      setPlayback(createSourcePlayback(events, duration, resourceMap))
    }
  }, [readyState, events, resourceMap, setPlayback])

  if (readyState === 'waiting') {
    return (
      <FX.Spin>
        <LoaderIcon size={20} />
      </FX.Spin>
    )
  }

  if (readyState === 'failed') {
    return (
      <Card>
        <AlertTriangleIcon size={24} />
        Unable to load recording. Please try again.
      </Card>
    )
  }

  return <PlaybackProvider playback={playback}>{children}</PlaybackProvider>
}
