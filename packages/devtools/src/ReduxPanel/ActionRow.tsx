import { Block, Inline, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { color, fontSize, fontWeight, spacing } from '@repro/design'
import { ReduxDispatchEvent } from '@repro/domain'
import { usePlayback } from '@repro/playback'
import React, { useState } from 'react'
import { JSONView } from '../JSONView/JSONView'
interface Props {
  event: ReduxDispatchEvent
  index: number
  isSelected: boolean
  onSelect: () => void
}

export const ActionRow: React.FC<Props> = ({
  event,
  index,
  isSelected,
  onSelect,
}) => {
  const playback = usePlayback()
  const [expanded, setExpanded] = useState(false)

  const handleClick = () => {
    onSelect()
    playback.seekToEvent(index)
    setExpanded(prev => !prev)
  }

  let payloadData: unknown = {}
  try {
    payloadData = JSON.parse(event.actionPayload)
  } catch {
    payloadData = event.actionPayload
  }

  let diffData: unknown = {}
  try {
    diffData = JSON.parse(event.stateDiff)
  } catch {
    diffData = event.stateDiff
  }

  const payloadPreview =
    event.actionPayload.slice(0, 60) +
    (event.actionPayload.length > 60 ? '…' : '')

  return (
    <Block
      backgroundColor={isSelected ? color.infoTint : 'transparent'}
      hoverBackgroundColor={isSelected ? color.infoTint : color.bg.subtle}
      borderBottom={`1px solid ${color.bg.hover}`}
    >
      <Row
        alignItems="center"
        gap={spacing.md}
        padding={spacing.md}
        cursor="pointer"
        userSelect="none"
        props={{ onClick: handleClick }}
      >
        <Inline
          fontSize={fontSize.xs}
          color={color.text.muted}
          fontFamily="monospace"
          flexShrink={0}
        >
          {formatTime(event.time, 'millis')}
        </Inline>

        <Inline
          fontSize={fontSize.xs}
          color={color.primary}
          fontWeight={fontWeight.semibold}
          flexShrink={0}
        >
          {event.actionType}
        </Inline>

        <Inline
          fontSize={fontSize.xs}
          color={color.text.muted}
          fontFamily="monospace"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {payloadPreview}
        </Inline>
      </Row>

      {expanded && (
        <Block padding={spacing.md} paddingTop={spacing.none}>
          <Block
            fontSize={fontSize.xs}
            fontWeight={fontWeight.semibold}
            color={color.text.muted}
            marginBottom={spacing.sm}
          >
            Payload
          </Block>
          <JSONView data={payloadData} />

          <Block
            fontSize={fontSize.xs}
            fontWeight={fontWeight.semibold}
            color={color.text.muted}
            marginTop={spacing.md}
            marginBottom={spacing.sm}
          >
            State diff
          </Block>
          <JSONView data={diffData} />
        </Block>
      )}
    </Block>
  )
}
