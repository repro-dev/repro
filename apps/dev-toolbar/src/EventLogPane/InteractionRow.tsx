import { Block } from '@jsxstyle/react'
import { InteractionEvent, InteractionType } from '@repro/domain'
import React from 'react'
import { BaseRow } from './BaseRow'

interface Props {
  event: InteractionEvent
  index: number
  style: React.CSSProperties
}

export const InteractionRow: React.FC<Props> = ({ event, index, style }) => {
  return event.data
    .map(data => (
      <BaseRow event={event} index={index} style={style}>
        <Block>{InteractionType[data.type]}</Block>
      </BaseRow>
    ))
    .orElse(null)
}
