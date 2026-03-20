import { Block } from '@jsxstyle/react'
import { NetworkEvent, NetworkMessageType } from '@repro/domain'
import React from 'react'
import { BaseRow } from './BaseRow'

interface Props {
  event: NetworkEvent
  index: number
  style: React.CSSProperties
}

export const NetworkRow: React.FC<Props> = ({ event, index, style }) => {
  return event.data
    .map(data => (
      <BaseRow event={event} index={index} style={style}>
        <Block>{NetworkMessageType[data.type]}</Block>
      </BaseRow>
    ))
    .orElse(null)
}
