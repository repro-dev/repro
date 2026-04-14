import { Block, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { color } from '@repro/design'
import { SourceEvent } from '@repro/domain'
import { usePlayback } from '@repro/playback'
import { Unboxed } from '@repro/tdl'
import React from 'react'

interface Props {
  eventIndex: number
  event: Unboxed<SourceEvent>
  color?: string
  icon?: React.ReactNode
  onClick?: () => void
}

export const BaseEntry: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  eventIndex,
  event,
  color: entryColor,
  icon,
  onClick,
}) => {
  const playback = usePlayback()

  function handleClick() {
    playback.seekToEvent(eventIndex)

    if (onClick) {
      onClick()
    }
  }

  return (
    <Row
      paddingH={15}
      alignItems="center"
      gap={5}
      overflow="hidden"
      fontSize={13}
      backgroundColor={color.bg.surface}
      hoverBackgroundColor={color.bg.subtle}
      color={entryColor}
      cursor="pointer"
      props={{ onClick: handleClick }}
    >
      <Block color={color.text.muted}>
        {formatTime(event.time, 'seconds')}
      </Block>

      <Block>{icon}</Block>

      <Block
        paddingV={5}
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {children}
      </Block>
    </Row>
  )
}
