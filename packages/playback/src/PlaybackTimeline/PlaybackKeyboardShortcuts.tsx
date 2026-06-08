import { Analytics } from '@repro/analytics'
import {
  isInputElement,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import React, { useCallback, useEffect } from 'react'
import { Shortcuts } from 'shortcuts'
import { usePlayback } from '../hooks'

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
        shortcut: 'ArrowLeft',
        handler: seekBackward,
      },
      {
        shortcut: 'ArrowRight',
        handler: seekForward,
      },
      {
        shortcut: 'Home',
        handler: seekToStart,
      },
      {
        shortcut: 'End',
        handler: seekToEnd,
      },
    ])

    return () => {
      shortcuts.reset()
    }
  }, [seekBackward, seekForward, seekToStart, seekToEnd])

  return null
}
