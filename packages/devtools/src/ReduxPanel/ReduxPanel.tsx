import { Block, Grid } from '@jsxstyle/react'
import { useAtomValue } from '@repro/atom'
import { color, spacing } from '@repro/design'
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
  // 2. Find the snapshot event index that corresponds to the baseline
  // 3. Only apply diffs AFTER the snapshot to avoid double-applying pre-snapshot events
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

    // Find the index of the Snapshot event that corresponds to our baseline.
    // Only apply diffs AFTER the snapshot to avoid double-applying pre-snapshot events.
    const sourceEvents = playback.getSourceEvents().toSource()
    let snapshotEventIndex = -1
    let i = 0
    for (const view of sourceEvents) {
      if (i > activeIndex) break
      const event = SourceEventView.over(view)
      event.apply(e => {
        if (e.type === SourceEventType.Snapshot) {
          snapshotEventIndex = i
        }
      })
      i++
    }

    for (const [event, eventIndex] of dispatchEvents) {
      if (eventIndex > activeIndex) break
      if (eventIndex <= snapshotEventIndex) continue // already in baseline
      try {
        const diff = JSON.parse(event.stateDiff) as Record<
          string,
          { after?: unknown }
        >
        for (const [key, entry] of Object.entries(diff)) {
          if (entry.after === undefined) {
            // Deleted key — remove from reconstructed state rather than setting to undefined
            delete state[key]
          } else {
            state[key] = entry.after
          }
        }
      } catch {
        // Skip unparseable diffs
      }
    }

    return state
  }, [snapshot, activeIndex, dispatchEvents, playback])

  if (dispatchEvents.length === 0) {
    return (
      <Block padding={spacing.xl} fontSize={12} color={color.text.muted}>
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
          onSelect={idx => setSelectedIndex(idx)}
        />
      </Block>

      <Block
        height="100%"
        overflow="auto"
        borderLeft={`1px solid ${color.border.default}`}
      >
        <StateTreePane state={reconstructedState} />
      </Block>
    </Grid>
  )
}
