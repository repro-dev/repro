import { Block, Grid } from '@jsxstyle/react'
import { useAtomValue } from '@repro/atom'
import { color, spacing } from '@repro/design'
import { SourceEventType, SourceEventView, StateEventType } from '@repro/domain'
import { usePlayback, useSnapshot } from '@repro/playback'
import React, { useMemo, useState } from 'react'
import { ComponentPropsPanel } from './ComponentPropsPanel'
import { ComponentTree } from './ComponentTree'
export const ReactPanel: React.FC = () => {
  const playback = usePlayback()
  const snapshot = useSnapshot()
  const activeIndex = useAtomValue(playback.$activeIndex)

  // Reconstruct the component tree at the current playback position.
  // Single pass: track the latest Snapshot index and collect ReactCommit
  // events that follow it (all at/before activeIndex).
  const componentMap = useMemo(() => {
    const map = new Map()
    const sourceEvents = playback.getSourceEvents().toSource()

    let snapshotEventIndex = -1
    const postSnapshotCommits: Array<{
      fiberNodeId: number
      parentFiberId: number | null
      componentName: string
      propsDelta: string
    }> = []

    let i = 0
    for (const view of sourceEvents) {
      if (i > activeIndex) break
      const event = SourceEventView.over(view)
      event.apply(e => {
        if (e.type === SourceEventType.Snapshot) {
          // Reset commits collected from previous snapshot window
          snapshotEventIndex = i
          postSnapshotCommits.length = 0
        } else if (i > snapshotEventIndex && e.type === SourceEventType.State) {
          e.data.apply(inner => {
            if (
              inner.type === StateEventType.ReactCommit &&
              inner.fiberNodeId !== 0
            ) {
              postSnapshotCommits.push({
                fiberNodeId: inner.fiberNodeId,
                parentFiberId: inner.parentFiberId,
                componentName: inner.componentName,
                propsDelta: inner.propsDelta,
              })
            }
          })
        }
      })
      i++
    }

    // Seed from snapshot baseline
    const reactTree = snapshot.frameworkState?.reactTree ?? null
    if (reactTree) {
      for (const node of Object.values(reactTree.nodes)) {
        // Skip sentinel nodes with fiberNodeId 0 (production builds emit these)
        if (node.fiberNodeId !== 0) {
          map.set(node.fiberNodeId, { ...node })
        }
      }
    }

    // Apply incremental commits on top of the snapshot baseline
    for (const commit of postSnapshotCommits) {
      map.set(commit.fiberNodeId, {
        fiberNodeId: commit.fiberNodeId,
        parentFiberId: commit.parentFiberId,
        componentName: commit.componentName,
        props: commit.propsDelta,
      })
    }

    return map
  }, [playback, snapshot, activeIndex])

  // Detect production build degradation: snapshot had nodes but all had fiberNodeId === 0
  const isProductionBuild = useMemo(() => {
    const reactTree = snapshot.frameworkState?.reactTree ?? null
    if (!reactTree) return false
    const nodes = Object.values(reactTree.nodes)
    return componentMap.size === 0 && nodes.length > 0
  }, [componentMap, snapshot])

  const [selectedFiberId, setSelectedFiberId] = useState<number | null>(null)

  const selectedNode =
    selectedFiberId !== null ? componentMap.get(selectedFiberId) ?? null : null

  if (componentMap.size === 0 && !isProductionBuild) {
    return (
      <Block padding={spacing.xl} fontSize={12} color={color.text.muted}>
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
            padding={spacing.md}
            fontSize={11}
            color={color.warning}
            backgroundColor={color.warningSubtle}
            borderBottom={`1px solid ${color.warningBorder}`}
          >
            Component hierarchy is only available in development builds. Showing
            flat list.
          </Block>
        )}
        <ComponentTree
          nodes={componentMap}
          rootId={snapshot.frameworkState?.reactTree?.rootId ?? null}
          selectedFiberId={selectedFiberId}
          onSelect={id => setSelectedFiberId(id)}
        />
      </Block>

      <Block
        height="100%"
        overflow="auto"
        borderLeft={`1px solid ${color.border.default}`}
      >
        <ComponentPropsPanel node={selectedNode} />
      </Block>
    </Grid>
  )
}
