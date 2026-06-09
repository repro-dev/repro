import { Analytics } from '@repro/analytics'
import React, { useCallback, useEffect } from 'react'
import { tinykeys } from 'tinykeys'
import { usePlayback } from '../hooks'
import { shouldIgnoreKeyboardEvent } from './keyboardIgnore'

export const PlaybackKeyboardShortcuts: React.FC = () => {
  const playback = usePlayback()

  const seekBackward = useCallback(() => {
    const time = Math.max(0, playback.getElapsed() - 5000)
    playback.seekToTime(time)
    Analytics.track('playback:keyboard-seek-backward')
  }, [playback])

  const seekForward = useCallback(() => {
    const time = Math.min(playback.getDuration(), playback.getElapsed() + 5000)
    playback.seekToTime(time)
    Analytics.track('playback:keyboard-seek-forward')
  }, [playback])

  const seekToStart = useCallback(() => {
    playback.seekToTime(0)
    Analytics.track('playback:keyboard-seek-to-start')
  }, [playback])

  const seekToEnd = useCallback(() => {
    playback.seekToTime(playback.getDuration())
    Analytics.track('playback:keyboard-seek-to-end')
  }, [playback])

  useEffect(() => {
    const unsubscribe = tinykeys(
      window,
      {
        ArrowLeft: seekBackward,
        ArrowRight: seekForward,
        Home: seekToStart,
        End: seekToEnd,
      },
      {
        ignore: shouldIgnoreKeyboardEvent,
      }
    )

    return () => {
      unsubscribe()
    }
  }, [seekBackward, seekForward, seekToStart, seekToEnd])

  return null
}
