import { Row } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { colors } from '@repro/design'
import {
  isInputElement,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import { Pause as PauseIcon, Play as PlayIcon } from 'lucide-react'
import React, { useCallback, useEffect } from 'react'
import { Shortcuts } from 'shortcuts'
import { usePlaybackState } from '..'
import { usePlayback } from '../hooks'
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

  useEffect(() => {
    const shortcuts = new Shortcuts({
      shouldHandleEvent() {
        let target = document.activeElement

        if (target?.shadowRoot) {
          target = target.shadowRoot.activeElement
        }

        if (target) {
          return (
            !isInputElement(target) &&
            !isTextAreaElement(target) &&
            !isSelectElement(target)
          )
        }

        return true
      },
    })

    shortcuts.add([
      {
        shortcut: 'Space',
        handler: togglePlayback,
      },
    ])

    return () => {
      shortcuts.reset()
    }
  }, [togglePlayback])

  return (
    <Row
      alignItems="center"
      justifyContent="center"
      width={32}
      height={32}
      color={colors.blue['700']}
      borderRadius={4}
      cursor="pointer"
      props={{ onClick: togglePlayback }}
    >
      {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
    </Row>
  )
}
