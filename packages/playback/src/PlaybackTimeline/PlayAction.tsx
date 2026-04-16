import { Row } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { color } from '@repro/design'
import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react'
import React, { useCallback, useMemo } from 'react'
import { usePlaybackState } from '..'
import { usePlayback, usePlaybackShortcuts } from '../hooks'
import { PlaybackState } from '../types'

export const PlayAction: React.FC = () => {
  const playback = usePlayback()
  const playbackState = usePlaybackState()
  const playing = playbackState === PlaybackState.Playing

  const togglePlayback = useCallback(() => {
    if (playing) {
      playback.pause()
      Analytics.track('playback:pause')
    } else {
      if (playback.getElapsed() === playback.getDuration()) {
        playback.seekToTime(0)
      }

      playback.play()
      Analytics.track('playback:play')
    }
  }, [playback, playing])

  const shortcutEntries = useMemo(
    () => [{ shortcut: 'Space', handler: togglePlayback }],
    [togglePlayback]
  )

  usePlaybackShortcuts(shortcutEntries)

  return (
    <Row
      alignItems="center"
      justifyContent="center"
      width={32}
      height={32}
      color={color.primary}
      borderRadius={4}
      cursor="pointer"
      props={{ onClick: togglePlayback }}
    >
      {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
    </Row>
  )
}
