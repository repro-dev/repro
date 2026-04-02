import { Block, Grid } from '@jsxstyle/react'
import { useAtomValue } from '@repro/atom'
import { colors } from '@repro/design'
import {
  ReduxDispatchEvent,
  SourceEventType,
  SourceEventView,
  StateEventType,
} from '@repro/domain'
import { usePlayback, useSnapshot } from '@repro/playback'
import React, { useMemo, useState } from 'react'
import { ActionLog } from './ActionLog'
import { StateTreePane } from './StateTreePane'

export const ReduxPanel: React.FC = () => {
  const playback = usePlayback()
  const snapshot = useSnapshot()
  const activeIndex = useAtomValue(playback.$activeIndex)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Collect all ReduxDispatchEvents with their source indices
  const dispatchEvents = useMemo(() => {
    const events: Array<[ReduxDispatchEvent, number]> = []
    const sourceEvents = playback.getSourceEvents().toSource()
    let i = 0
    for (const view of sourceEvents) {
      const event = SourceEventView.over(view)
      event.apply(e => {
        if (e.type === SourceEventType.State) {
          e.data.apply(inner => {
            if (inner.type === StateEventType.ReduxDispatch) {
              events.push([inner as ReduxDispatchEvent, i])
            }
          })
        }
      })
      i++
    }
    return events
  }, [playback])

  // Reconstruct Redux state at current playback position:
  // 1. Parse snapshot baseline (or start from {})
  // 2. Apply stateDiffs from dispatch events with eventIndex <= activeIndex
  const reconstructedState = useMemo(() => {
    let state: Record<string, unknown> = {}

    const baselineJson = snapshot.frameworkState?.reduxState
    if (baselineJson) {
      try {
        const parsed = JSON.parse(baselineJson)
        if (typeof parsed === 'object' && parsed !== null) {
          state = parsed as Record<string, unknown>
        }
      } catch {
        // Baseline unparseable — start from empty state
      }
    }

    for (const [event, eventIndex] of dispatchEvents) {
      if (eventIndex > activeIndex) break
      try {
        const diff = JSON.parse(event.stateDiff) as Record<
          string,
          { before: unknown; after: unknown }
        >
        for (const [key, entry] of Object.entries(diff)) {
          state[key] = entry.after
        }
      } catch {
        // Skip unparseable diffs
      }
    }

    return state
  }, [snapshot, activeIndex, dispatchEvents])

  if (dispatchEvents.length === 0) {
    return (
      <Block padding={16} fontSize={12} color={colors.slate['500']}>
        No Redux actions recorded.
      </Block>
    )
  }

  return (
    <Grid gridTemplateColumns="1fr 360px" alignItems="stretch" height="100%">
      <Block height="100%" overflow="auto">
        <ActionLog
          events={dispatchEvents}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      </Block>

      <Block
        height="100%"
        overflow="auto"
        borderLeft={`1px solid ${colors.slate['200']}`}
      >
        <StateTreePane state={reconstructedState} />
      </Block>
    </Grid>
  )
}
