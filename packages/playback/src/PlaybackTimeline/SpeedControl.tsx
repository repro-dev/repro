import { Block, Row } from '@jsxstyle/react'
import { color, Tooltip } from '@repro/design'
import {
  isInputElement,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import React, { useCallback, useEffect } from 'react'
import { Shortcuts } from 'shortcuts'
import { usePlayback, useSpeed } from '../hooks'
import { PlaybackSpeed, VALID_SPEEDS } from '../types'

// Cycle through valid speeds in the given direction
function getNextSpeed(
  current: PlaybackSpeed,
  direction: 'up' | 'down'
): PlaybackSpeed {
  const index = VALID_SPEEDS.indexOf(current)
  if (direction === 'up') {
    return VALID_SPEEDS[Math.min(VALID_SPEEDS.length - 1, index + 1)] ?? current
  } else {
    return VALID_SPEEDS[Math.max(0, index - 1)] ?? current
  }
}

export const SpeedControl: React.FC = () => {
  const playback = usePlayback()
  const speed = useSpeed()

  const cycleSpeed = useCallback(() => {
    const next = getNextSpeed(speed, 'up')
    // Wrap around to the start if at max speed
    if (next === speed) {
      playback.setSpeed(VALID_SPEEDS[0] ?? 1)
    } else {
      playback.setSpeed(next)
    }
  }, [playback, speed])

  const increaseSpeed = useCallback(() => {
    playback.setSpeed(getNextSpeed(speed, 'up'))
  }, [playback, speed])

  const decreaseSpeed = useCallback(() => {
    playback.setSpeed(getNextSpeed(speed, 'down'))
  }, [playback, speed])

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
        // + or = key to increase speed
        shortcut: 'Plus',
        handler: increaseSpeed,
      },
      {
        shortcut: 'Equal',
        handler: increaseSpeed,
      },
      {
        // - key to decrease speed
        shortcut: 'Minus',
        handler: decreaseSpeed,
      },
    ])

    return () => {
      shortcuts.reset()
    }
  }, [increaseSpeed, decreaseSpeed])

  return (
    <Row
      alignItems="center"
      justifyContent="center"
      height={32}
      minWidth={40}
      paddingH={6}
      color={color.primary}
      hoverBackgroundColor={color.bg.hover}
      borderRadius={4}
      fontSize={11}
      fontWeight={600}
      fontFamily="monospace"
      userSelect="none"
      cursor="pointer"
      whiteSpace="nowrap"
      transition="background-color 250ms ease-in-out"
      props={{ onClick: cycleSpeed }}
    >
      <Block>
        <Tooltip position="top">Playback speed</Tooltip>
        {speed.toFixed(1)}x
      </Block>
    </Row>
  )
}
