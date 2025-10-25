import { Block, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { colors } from '@repro/design'
import { SourceEvent } from '@repro/domain'
import { usePlayback } from '@repro/playback'
import { Unboxed } from '@repro/tdl'
import React, { PropsWithChildren } from 'react'

interface Props {
  eventIndex: number
  event: Unboxed<SourceEvent>
  color?: string
  icon?: React.ReactNode
  onClick?: () => void
}

export const BaseEntry: React.FC<PropsWithChildren<Props>> = ({
  children,
  eventIndex,
  event,
  color,
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
      backgroundColor={colors.white}
      hoverBackgroundColor={colors.slate['50']}
      color={color}
      cursor="pointer"
      props={{ onClick: handleClick }}
    >
      <Block color={colors.slate['500']}>
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
