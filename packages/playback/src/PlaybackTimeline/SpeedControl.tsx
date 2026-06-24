import { Block, Row } from '@jsxstyle/react'
import {
  Tooltip,
  color,
  fontSize,
  fontWeight,
  spacing,
  transition,
} from '@repro/design'
import React, { useCallback, useEffect } from 'react'
import { tinykeys } from 'tinykeys'
import { usePlayback, useSpeed } from '../hooks'
import { usePlaybackHud } from '../PlaybackCanvas/PlaybackHudContext'
import { PlaybackSpeed, VALID_SPEEDS } from '../types'
import { shouldIgnoreKeyboardEvent } from './keyboardIgnore'

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
  const { showHud } = usePlaybackHud()

  const cycleSpeed = useCallback(() => {
    const next = getNextSpeed(speed, 'up')
    if (next === speed) {
      playback.setSpeed(VALID_SPEEDS[0] ?? 1)
    } else {
      playback.setSpeed(next)
    }
  }, [playback, speed])

  const increaseSpeed = useCallback(() => {
    const next = getNextSpeed(speed, 'up')
    playback.setSpeed(next)
    showHud('speed-up', { speed: next })
  }, [playback, speed, showHud])

  const decreaseSpeed = useCallback(() => {
    const next = getNextSpeed(speed, 'down')
    playback.setSpeed(next)
    showHud('speed-down', { speed: next })
  }, [playback, speed, showHud])

  useEffect(() => {
    const unsubscribe = tinykeys(
      window,
      {
        '=': increaseSpeed,
        '-': decreaseSpeed,
      },
      {
        ignore: shouldIgnoreKeyboardEvent,
      }
    )

    return () => {
      unsubscribe()
    }
  }, [increaseSpeed, decreaseSpeed])

  return (
    <Row
      alignItems="center"
      justifyContent="center"
      height={32}
      minWidth={40}
      paddingH={spacing.sm}
      color={color.primary}
      hoverBackgroundColor={color.bg.hover}
      borderRadius={4}
      fontSize={fontSize.xs}
      fontWeight={fontWeight.semibold}
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
