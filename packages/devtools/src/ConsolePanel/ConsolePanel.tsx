import { Block, Grid } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { Stats } from '@repro/diagnostics'
import {
  ConsoleEvent,
  MessagePartType,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { ControlFrame, ElapsedMarker, usePlayback } from '@repro/playback'
import { Box } from '@repro/tdl'
import React, {
  Fragment,
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { filter } from 'rxjs'
import { useConsoleLevelFilter, useConsoleSearch } from '../hooks'
import { pairwise } from '../utils'
import { ConsoleRow } from './ConsoleRow'
import { LevelFilter } from './LevelFilter'
import { SearchForm } from './SearchForm'
import { enumToBitField } from './util'

function isConsoleEvent(event: SourceEvent): event is Box<ConsoleEvent> {
  return event.match(event => event.type === SourceEventType.Console)
}

export const ConsolePanel: React.FC = () => {
  const playback = usePlayback()
  const [consoleSearch, setConsoleSearch] = useConsoleSearch()
  const [consoleLevelFilter, setConsoleLevelFilter] = useConsoleLevelFilter()
  const rowContainerRef = useRef() as MutableRefObject<HTMLDivElement>

  const consoleEvents = useMemo(() => {
    const events: Array<[ConsoleEvent, number]> = []

    Stats.time(
      'ConsolePanel -> get console messages from source events',
      () => {
        const sourceEvents = playback.getSourceEvents().toSource()
        let i = 0

        for (const view of sourceEvents) {
          const event = SourceEventView.over(view)

          if (isConsoleEvent(event)) {
            event.apply(event => {
              events.push([event, i])
            })
          }

          i++
        }
      }
    )

    return events
  }, [playback])

  const filteredConsoleEvents = useMemo(() => {
    return Stats.time('ConsolePanel -> filter console events', () => {
      return consoleEvents.filter(([event]) => {
        const levelBitField = enumToBitField(event.data.level)

        return (
          (levelBitField & consoleLevelFilter) !== 0 &&
          event.data.parts.some(part => {
            // TODO: apply search filter to Node and Date message parts
            return part.match(
              part =>
                part.type === MessagePartType.Node ||
                (part.type === MessagePartType.String &&
                  part.value.includes(consoleSearch))
            )
          })
        )
      })
    })
  }, [consoleEvents, consoleSearch, consoleLevelFilter])

  const filteredPairs = useMemo(
    () =>
      Stats.time('ConsolePanel -> create console event pairs', () =>
        pairwise(filteredConsoleEvents)
      ),
    [filteredConsoleEvents]
  )

  useEffect(() => {
    const subscription = playback.$latestControlFrame
      .pipe(filter(controlFrame => controlFrame === ControlFrame.SeekToEvent))
      .subscribe(() => {
        const activeIndex = playback.getActiveIndex()
        const listIndex = filteredConsoleEvents.findIndex(
          ([, eventIndex]) => eventIndex === activeIndex
        )

        if (listIndex !== -1) {
          const row = rowContainerRef.current.querySelectorAll(
            `[data-target='console-row']`
          )[listIndex]

          if (row) {
            const { top: containerTop, height: containerHeight } =
              rowContainerRef.current.getBoundingClientRect()

            const { top: rowTop } = row.getBoundingClientRect()

            if (
              rowTop < containerTop ||
              rowTop > containerTop + containerHeight
            ) {
              row.scrollIntoView({ block: 'start' })
            }
          }
        }
      })

    return () => {
      subscription.unsubscribe()
    }
  }, [playback, filteredConsoleEvents, rowContainerRef])

  return (
    <Grid gridTemplateRows="auto 1fr" height="100%">
      <Grid
        alignItems="center"
        gap={20}
        padding={10}
        gridTemplateColumns="2fr 2fr 1fr"
        borderBottom={`1px solid ${colors.slate['200']}`}
      >
        <SearchForm value={consoleSearch} onChange={setConsoleSearch} />

        <LevelFilter
          value={consoleLevelFilter}
          onChange={setConsoleLevelFilter}
        />

        <Block justifySelf="end" fontSize={13} color={colors.slate['500']}>
          {consoleEvents.length !== filteredConsoleEvents.length &&
            `${consoleEvents.length - filteredConsoleEvents.length} hidden`}
        </Block>
      </Grid>

      <Block overflow="auto" props={{ ref: rowContainerRef }}>
        {filteredPairs.map(([prev, event], i) => (
          <Fragment key={i}>
            <ElapsedMarker
              prevIndex={prev ? prev[1] : -1}
              nextIndex={event ? event[1] : Number.MAX_SAFE_INTEGER}
            />
            {event !== null && <ConsoleRow event={event[0]} index={event[1]} />}
          </Fragment>
        ))}
      </Block>
    </Grid>
  )
}
