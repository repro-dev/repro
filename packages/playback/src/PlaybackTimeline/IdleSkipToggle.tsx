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
import { useIdleSkipEnabled, usePlayback } from '../hooks'
import { shouldIgnoreKeyboardEvent } from './keyboardIgnore'

export const IdleSkipToggle: React.FC = () => {
  const playback = usePlayback()
  const enabled = useIdleSkipEnabled()

  const toggle = useCallback(() => {
    playback.setIdleSkipEnabled(!enabled)
  }, [playback, enabled])

  useEffect(() => {
    const unsubscribe = tinykeys(
      window,
      {
        i: toggle,
      },
      {
        ignore: shouldIgnoreKeyboardEvent,
      }
    )

    return () => {
      unsubscribe()
    }
  }, [toggle])

  return (
    <Row
      alignItems="center"
      justifyContent="center"
      height={32}
      minWidth={40}
      paddingH={spacing.sm}
      color={enabled ? color.primary : color.text.muted}
      hoverBackgroundColor={color.bg.hover}
      borderRadius={4}
      fontSize={fontSize.xs}
      fontWeight={fontWeight.semibold}
      fontFamily="monospace"
      userSelect="none"
      cursor="pointer"
      whiteSpace="nowrap"
      transition={transition.default}
      props={{ onClick: toggle }}
    >
      <Block>
        <Tooltip position="top">
          {enabled ? 'Skip idle regions (on)' : 'Skip idle regions (off)'}
        </Tooltip>
        {enabled ? 'Skip Idle' : 'Keep All'}
      </Block>
    </Row>
  )
}
