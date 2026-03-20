import { Block } from '@jsxstyle/react'
import { ConsoleEvent, LogLevel } from '@repro/domain'
import React from 'react'
import { BaseRow } from './BaseRow'

interface Props {
  event: ConsoleEvent
  index: number
  style: React.CSSProperties
}

export const ConsoleRow: React.FC<Props> = ({ event, index, style }) => {
  return (
    <BaseRow event={event} index={index} style={style}>
      <Block>{LogLevel[event.data.level]}</Block>
    </BaseRow>
  )
}
