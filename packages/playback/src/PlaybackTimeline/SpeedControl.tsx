import { Block, Row } from '@jsxstyle/react'
import { color, Tooltip, transition } from '@repro/design'
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
        shortcut: '=',
        handler: increaseSpeed,
      },
    ])

    // The Shortcuts library treats '-' as a removal command, so
    // the minus key must be bound via a raw keydown listener.
    const handleMinus = (e: KeyboardEvent) => {
      // Run the same focus filter as Shortcuts.shouldHandleEvent.
      let target = document.activeElement
      if (target?.shadowRoot) {
        target = target.shadowRoot.activeElement
      }
      if (
        target &&
        (isInputElement(target) ||
          isTextAreaElement(target) ||
          isSelectElement(target))
      ) {
        return
      }

      if (e.key === '-' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        decreaseSpeed()
      }
    }

    document.addEventListener('keydown', handleMinus, { capture: true })

    return () => {
      shortcuts.reset()
      document.removeEventListener('keydown', handleMinus, { capture: true })
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
      transition={transition.default}
      props={{ onClick: cycleSpeed }}
    >
      <Block>
        <Tooltip position="top">Playback speed</Tooltip>
        {speed.toFixed(1)}x
      </Block>
    </Row>
  )
}
