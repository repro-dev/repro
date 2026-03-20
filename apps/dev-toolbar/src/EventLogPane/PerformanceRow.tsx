import { Block } from '@jsxstyle/react'
import { PerformanceEntryType, PerformanceEvent } from '@repro/domain'
import React from 'react'
import { BaseRow } from './BaseRow'

interface Props {
  event: PerformanceEvent
  index: number
  style: React.CSSProperties
}

export const PerformanceRow: React.FC<Props> = ({ event, index, style }) => {
  return event.data
    .map(data => (
      <BaseRow event={event} index={index} style={style}>
        <Block>{PerformanceEntryType[data.type]}</Block>
      </BaseRow>
    ))
    .orElse(null)
}
