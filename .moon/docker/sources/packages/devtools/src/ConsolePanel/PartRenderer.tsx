import { JSONView } from '@repro/design'
import { MessagePart, MessagePartType } from '@repro/domain'
import React from 'react'
import { deserializeError, isErrorLike } from 'serialize-error'
import { VNodeRenderer } from './VNodeRenderer'

function safeParse(value: string) {
  try {
    value = JSON.parse(value)

    if (isErrorLike(value)) {
      return deserializeError(value)
    }

    return value
  } catch {
    return value
  }
}

interface Props {
  part: MessagePart
}

export const PartRenderer: React.FC<Props> = ({ part }) => {
  return part
    .map(part => {
      switch (part.type) {
        case MessagePartType.Node:
          return part.node ? <VNodeRenderer node={part.node} /> : null

        case MessagePartType.Date:
          const data = new Date()
          data.setUTCFullYear(part.year)
          data.setUTCMonth(part.month)
          data.setUTCDate(part.day)
          data.setUTCHours(part.hour)
          data.setUTCMinutes(part.minute + part.timezoneOffset)
          data.setUTCSeconds(part.second)
          data.setUTCMilliseconds(part.millisecond)
          return <JSONView data={data} />

        case MessagePartType.Undefined:
          return <JSONView data={undefined} />

        case MessagePartType.String:
          return <JSONView data={safeParse(part.value)} />
      }
    })
    .orElse(null)
}
