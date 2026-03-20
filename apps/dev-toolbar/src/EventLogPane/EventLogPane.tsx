import { Block, Grid, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { SourceEvent, SourceEventType } from '@repro/domain'
import { InterruptSignal, useRecordingStream } from '@repro/recording'
import { TablePropertiesIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { FixedSizeList, ListChildComponentProps } from 'react-window'
import { asyncScheduler, concat, from, observeOn, scan } from 'rxjs'
import { BaseRow } from './BaseRow'
import { ConsoleRow } from './ConsoleRow'
import { DOMPatchRow } from './DOMPatchRow'
import { Details } from './Details'
import { InteractionRow } from './InteractionRow'
import { NetworkRow } from './NetworkRow'
import { PerformanceRow } from './PerformanceRow'
import { LogItem } from './types'
import { collapseItemsIntoGroups, unpackFirstEvent } from './utils'

const ItemRow: React.FC<ListChildComponentProps<Array<LogItem>>> = ({
  index,
  style,
  data: items,
}) => {
  const item = items[index]

  if (!item) {
    return null
  }

  const firstEvent = unpackFirstEvent(item)

  if (firstEvent) {
    return firstEvent
      .map(firstEvent => {
        switch (firstEvent.type) {
          case SourceEventType.Console:
            return <ConsoleRow event={firstEvent} index={index} style={style} />

          case SourceEventType.DOMPatch:
            return (
              <DOMPatchRow event={firstEvent} index={index} style={style} />
            )

          case SourceEventType.Interaction:
            return (
              <InteractionRow event={firstEvent} index={index} style={style} />
            )

          case SourceEventType.Network:
            return <NetworkRow event={firstEvent} index={index} style={style} />

          case SourceEventType.Performance:
            return (
              <PerformanceRow event={firstEvent} index={index} style={style} />
            )

          default:
            return <BaseRow event={firstEvent} index={index} style={style} />
        }
      })
      .orElse(null)
  }

  return null
}

export const EventLogPane: React.FC = () => {
  const recordingStream = useRecordingStream()
  const [items, setItems] = useState<Array<LogItem>>([])

  useEffect(() => {
    const event$ = concat(
      from(recordingStream.slice()),
      concat(recordingStream.tail(InterruptSignal))
    )

    const logItems$ = event$.pipe(
      scan<SourceEvent, Array<LogItem>>((logItems, event) => {
        return collapseItemsIntoGroups([...logItems, event])
      }, [])
    )

    const subscription = logItems$
      .pipe(observeOn(asyncScheduler))
      .subscribe(setItems)

    return () => {
      subscription.unsubscribe()
    }
  }, [recordingStream, setItems])

  return (
    <Grid
      position="absolute"
      bottom={60}
      right={20}
      width={960}
      gridTemplateRows="auto 1fr"
      gridTemplateColumns="300px 1fr"
      background={colors.slate['100']}
      borderColor={colors.slate['700']}
      borderStyle="solid"
      borderWidth="3px 1px 1px"
      pointerEvents="auto"
    >
      <Row
        gridColumn="1 / span 2"
        alignItems="center"
        gap={5}
        padding={10}
        borderColor={colors.slate['300']}
        borderStyle="solid"
        borderWidth="0 0 1px"
        pointerEvents="auto"
      >
        <TablePropertiesIcon size={24} color={colors.slate['700']} />

        <Block color={colors.slate['700']} fontSize={16}>
          Event Log
        </Block>
      </Row>

      <Block
        width={300}
        backgroundColor={colors.slate['50']}
        borderColor={colors.slate['300']}
        borderStyle="solid"
        borderWidth="0 1px 0 0"
      >
        <FixedSizeList
          height={720}
          width="100%"
          itemSize={40}
          itemCount={items.length}
          itemData={items}
        >
          {ItemRow}
        </FixedSizeList>
      </Block>

      <Block height={720} overflow="hidden">
        <Details />
      </Block>
    </Grid>
  )
}
