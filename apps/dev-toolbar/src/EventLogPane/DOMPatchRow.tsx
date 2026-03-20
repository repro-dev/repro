import { Block } from '@jsxstyle/react'
import { DOMPatchEvent, PatchType } from '@repro/domain'
import React from 'react'
import { BaseRow } from './BaseRow'

interface Props {
  event: DOMPatchEvent
  index: number
  style: React.CSSProperties
}

export const DOMPatchRow: React.FC<Props> = ({ event, index, style }) => {
  return event.data
    .map(data => (
      <BaseRow event={event} index={index} style={style}>
        <Block>{PatchType[data.type]}</Block>
      </BaseRow>
    ))
    .orElse(null)
}
