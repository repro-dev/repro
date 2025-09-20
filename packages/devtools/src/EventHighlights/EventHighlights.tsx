import { Grid, InlineBlock, Row } from '@jsxstyle/react'
import { FX, colors } from '@repro/design'
import {
  InteractionType,
  LogLevel,
  NetworkMessageType,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { ElapsedMarker, usePlayback } from '@repro/playback'
import { LoaderIcon } from 'lucide-react'
import React, { Fragment, useEffect, useState } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'
import { FixedSizeList, ListChildComponentProps } from 'react-window'
import { distinctUntilChanged } from 'rxjs'
import { ConsoleEntry } from './ConsoleEntry'
import { InteractionEntry } from './InteractionEntry'
import { NetworkEntry } from './NetworkEntry'

function shouldIncludeEvent(event: SourceEvent) {
  return event.match(event => {
    switch (event.type) {
      case SourceEventType.Interaction:
        return event.data.match(data => data.type === InteractionType.Click)

      case SourceEventType.Console:
        return event.data.level === LogLevel.Error

      case SourceEventType.Network:
        return event.data.match(
          data =>
            data.type === NetworkMessageType.FetchRequest ||
            data.type === NetworkMessageType.WebSocketOpen
        )
    }

    return false
  })
}

export const EventHighlights: React.FC = () => {
  const playback = usePlayback()
  const [userEvents, setUserEvents] = useState<Array<[number, SourceEvent]>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const subscription = playback.$latestEventTime
      .pipe(distinctUntilChanged())
      .subscribe(latestEventTime => {
        const duration = playback.getDuration()

        const allSourceEvents = playback.getSourceEvents().toSource()
        const events: Array<[number, SourceEvent]> = []

        for (let i = 0, len = allSourceEvents.length; i < len; i++) {
          const dataView = allSourceEvents[i]

          if (dataView) {
            const event = SourceEventView.over(dataView)

            if (shouldIncludeEvent(event)) {
              events.push([i, event])
            }
          }
        }

        setUserEvents(events)
        setLoading(latestEventTime < duration)
      })

    return () => {
      subscription.unsubscribe()
    }
  }, [playback, setUserEvents])

  if (loading) {
    return (
      <Row
        alignItems="center"
        gap={5}
        paddingBlock={10}
        paddingInline={15}
        borderTop={`1px solid ${colors.slate['200']}`}
        backgroundColor={colors.slate['50']}
      >
        <FX.Spin>
          <LoaderIcon size={16} />
        </FX.Spin>

        <InlineBlock fontSize={13}>Loading events...</InlineBlock>
      </Row>
    )
  }

  if (userEvents.length === 0) {
    return null
  }

  const firstEvent = userEvents[0]

  return (
    <Fragment>
      <ElapsedMarker
        prevIndex={-1}
        nextIndex={firstEvent?.[0] ?? Number.MAX_SAFE_INTEGER}
      />

      <AutoSizer disableWidth>
        {({ height }) => (
          <FixedSizeList
            height={height}
            width="100%"
            itemSize={40}
            itemCount={userEvents.length}
            itemData={userEvents}
          >
            {UserEventRow}
          </FixedSizeList>
        )}
      </AutoSizer>
    </Fragment>
  )
}

const UserEventRow: React.FC<
  ListChildComponentProps<Array<[number, SourceEvent]>>
> = ({ index, style, data: userEvents }) => {
  const indexedEvent = userEvents[index]

  if (!indexedEvent) {
    return null
  }

  const [eventIndex, event] = indexedEvent
  const nextEvent = userEvents[index + 1]

  let entry: React.ReactNode = null

  event.apply(event => {
    switch (event.type) {
      case SourceEventType.Console:
        entry = <ConsoleEntry eventIndex={eventIndex} event={event} />
        break

      case SourceEventType.Interaction:
        entry = <InteractionEntry eventIndex={eventIndex} event={event} />
        break

      case SourceEventType.Network:
        entry = <NetworkEntry eventIndex={eventIndex} event={event} />
        break
    }
  })

  return (
    <Grid gridTemplateRows="36px 4px" style={style}>
      {entry}
      <ElapsedMarker
        prevIndex={eventIndex}
        nextIndex={nextEvent?.[0] ?? Number.MAX_SAFE_INTEGER}
      />
    </Grid>
  )
}
