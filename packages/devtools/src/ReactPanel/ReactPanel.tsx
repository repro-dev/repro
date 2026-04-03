import { Block, Grid } from '@jsxstyle/react'
import { useAtomValue } from '@repro/atom'
import { colors } from '@repro/design'
import {
  ReactComponentNode,
  SourceEventType,
  SourceEventView,
  StateEventType,
} from '@repro/domain'
import { usePlayback, useSnapshot } from '@repro/playback'
import React, { useMemo, useState } from 'react'
import { ComponentPropsPanel } from './ComponentPropsPanel'
import { ComponentTree } from './ComponentTree'

export const ReactPanel: React.FC = () => {
  const playback = usePlayback()
  const snapshot = useSnapshot()
  const activeIndex = useAtomValue(playback.$activeIndex)

  // Reconstruct the component tree at the current playback position.
  // Strategy:
  //   1. Find the Snapshot event at or before activeIndex — this is snapshotEventIndex.
  //   2. Seed the map from snapshot.frameworkState.reactTree (the baseline at snapshotEventIndex).
  //   3. Apply only ReactCommit events AFTER snapshotEventIndex up to activeIndex.
  // This avoids double-applying commits that occurred before the snapshot was taken.
  const componentMap = useMemo(() => {
    const map = new Map<number, ReactComponentNode>()

    // 1. Seed from snapshot baseline
    const reactTree = snapshot.frameworkState?.reactTree ?? null
    if (reactTree) {
      for (const node of Object.values(reactTree)) {
        // Skip sentinel nodes with fiberNodeId 0 (production builds emit these)
        if (node.fiberNodeId !== 0) {
          map.set(node.fiberNodeId, { ...node })
        }
      }
    }

    // 2. Find the index of the Snapshot event that corresponds to our baseline.
    //    Walk backwards from activeIndex to find the last Snapshot event.
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

    // 3. Apply incremental ReactCommit events after the snapshot baseline
    i = 0
    for (const view of sourceEvents) {
      if (i > activeIndex) break
      if (i > snapshotEventIndex) {
        const event = SourceEventView.over(view)
        event.apply(e => {
          if (e.type === SourceEventType.State) {
            e.data.apply(inner => {
              if (
                inner.type === StateEventType.ReactCommit &&
                inner.fiberNodeId !== 0
              ) {
                // NOTE: only propsDelta from the most recent commit is stored.
                // This means node.props reflects the last seen delta, not full current props.
                // Full props reconstruction is deferred to a future snapshot-based approach.
                map.set(inner.fiberNodeId, {
                  fiberNodeId: inner.fiberNodeId,
                  parentFiberId: inner.parentFiberId ?? 0,
                  componentName: inner.componentName,
                  props: inner.propsDelta,
                })
              }
            })
          }
        })
      }
      i++
    }

    return map
  }, [playback, snapshot, activeIndex])

  // Detect production build degradation: snapshot had nodes but all had fiberNodeId === 0
  const isProductionBuild = useMemo(() => {
    const reactTree = snapshot.frameworkState?.reactTree ?? null
    if (!reactTree) return false
    const nodes = Object.values(reactTree)
    return componentMap.size === 0 && nodes.length > 0
  }, [componentMap, snapshot])

  const [selectedFiberId, setSelectedFiberId] = useState<number | null>(null)

  const selectedNode =
    selectedFiberId !== null ? componentMap.get(selectedFiberId) ?? null : null

  if (componentMap.size === 0 && !isProductionBuild) {
    return (
      <Block padding={16} fontSize={12} color={colors.slate['500']}>
        No component data yet. Scrub the timeline to see the React component
        tree.
      </Block>
    )
  }

  return (
    <Grid gridTemplateColumns="1fr 360px" alignItems="stretch" height="100%">
      <Block height="100%" overflow="auto">
        {isProductionBuild && (
          <Block
            padding={8}
            fontSize={11}
            color={colors.orange['700']}
            backgroundColor={colors.orange['50']}
            borderBottom={`1px solid ${colors.orange['200']}`}
          >
            Component hierarchy is only available in development builds. Showing
            flat list.
          </Block>
        )}
        <ComponentTree
          nodes={componentMap}
          selectedFiberId={selectedFiberId}
          onSelect={setSelectedFiberId}
        />
      </Block>

      <Block
        height="100%"
        overflow="auto"
        borderLeft={`1px solid ${colors.slate['200']}`}
      >
        <ComponentPropsPanel node={selectedNode} />
      </Block>
    </Grid>
  )
}
