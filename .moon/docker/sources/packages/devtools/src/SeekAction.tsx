import { Block, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
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
      gap={5}
      padding={5}
      whiteSpace="nowrap"
      color={colors.white}
      backgroundColor={colors.blue['500']}
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
