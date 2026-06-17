import { Block, Row } from '@jsxstyle/react'
import { color, spacing } from '@repro/design'
import { usePlayback } from '@repro/playback'
import { SkipForward } from 'lucide-react'
import React, { useCallback } from 'react'

interface Props {
  eventIndex: number
}

export const SeekAction: React.FC<Props> = ({ eventIndex }) => {
  const playback = usePlayback()

  const onClick = useCallback(() => {
    playback.seekToEvent(eventIndex)
  }, [playback, eventIndex])

  return (
    <Row
      alignItems="center"
      gap={spacing.sm}
      padding={spacing.sm}
      whiteSpace="nowrap"
      color={color.text.inverse}
      backgroundColor={color.border.focus}
      borderRadius={4}
      opacity={0}
      hoverOpacity={1}
      userSelect="none"
      cursor="pointer"
      props={{ onClick }}
    >
      <SkipForward size={13} />
      <Block fontSize={11}>Go To Time</Block>
    </Row>
  )
}
