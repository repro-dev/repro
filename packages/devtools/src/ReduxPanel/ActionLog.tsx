import { Block } from '@jsxstyle/react'
import { ReduxDispatchEvent } from '@repro/domain'
import { ElapsedMarker } from '@repro/playback'
import React, { Fragment } from 'react'
import { pairwise } from '../utils'
import { ActionRow } from './ActionRow'

interface Props {
  events: Array<[ReduxDispatchEvent, number]>
  selectedIndex: number | null
  onSelect: (index: number) => void
}

export const ActionLog: React.FC<Props> = ({
  events,
  selectedIndex,
  onSelect,
}) => {
  const pairs = pairwise(events)

  return (
    <Block>
      {pairs.map(([prev, event], i) => (
        <Fragment key={i}>
          <ElapsedMarker
            prevIndex={prev ? prev[1] : -1}
            nextIndex={event ? event[1] : Number.MAX_SAFE_INTEGER}
          />
          {event !== null && (
            <ActionRow
              event={event[0]}
              index={event[1]}
              isSelected={selectedIndex === event[1]}
              onSelect={() => onSelect(event[1])}
            />
          )}
        </Fragment>
      ))}
    </Block>
  )
}
