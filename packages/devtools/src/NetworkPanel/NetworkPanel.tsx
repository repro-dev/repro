import { Block, Grid, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { Stats } from '@repro/diagnostics'
import { ControlFrame, ElapsedMarker, usePlayback } from '@repro/playback'
import {
  FetchGroup,
  findIndexedNetworkEvents,
  groupNetworkEvents,
  WebSocketGroup,
} from '@repro/source-utils'
import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { filter } from 'rxjs'
import { pairwise } from '../utils'
import { DetailsOverlay } from './DetailsOverlay'
import { NetworkRow } from './NetworkRow'

function getStartIndex(group: FetchGroup | WebSocketGroup) {
  return group.type === 'fetch' ? group.requestIndex : group.openIndex
}

export const NetworkPanel: React.FC = () => {
  const playback = usePlayback()
  const [selectedGroup, setSelectedGroup] = useState<
    FetchGroup | WebSocketGroup | null
  >(null)

  const networkEvents = useMemo(() => {
    return Stats.time(
      'NetworkPanel -> get network messages from source events',
      () => {
        const sourceEvents = playback.getSourceEvents()
        const indexedNetworkEvents = findIndexedNetworkEvents(sourceEvents)
        return groupNetworkEvents(indexedNetworkEvents)
      }
    )
  }, [playback])

  const networkEventPairs = useMemo(
    () =>
      Stats.time('NetworkPanel -> create network event pairs', () =>
        pairwise(networkEvents)
      ),
    [networkEvents]
  )

  useEffect(() => {
    const subscription = playback.$latestControlFrame
      .pipe(filter(controlFrame => controlFrame === ControlFrame.SeekToEvent))
      .subscribe(() => {
        const activeIndex = playback.getActiveIndex()

        const group = networkEvents.find(group => {
          return group.type === 'fetch'
            ? group.requestIndex === activeIndex
            : group.openIndex === activeIndex
        })

        if (group) {
          setSelectedGroup(group)
        }
      })

    return () => {
      subscription.unsubscribe()
    }
  }, [playback, networkEvents, setSelectedGroup])

  const columnTracks = `
    auto
    minmax(480px, 6fr)
    minmax(80px, 1fr)
    minmax(80px, 1fr)
    minmax(80px, 1fr)
    minmax(80px, 1fr)
    3fr
  `

  return (
    <Grid
      position="relative"
      gridTemplateRows="auto 1fr"
      height="100%"
      overflow="hidden"
    >
      <Grid
        alignItems="center"
        gridTemplateColumns={columnTracks}
        overflow="auto"
      >
        <Block display="contents" fontWeight={700}>
          {['Time', 'URL', 'Status', 'Type', 'Size', 'Duration', ''].map(
            (label, i) => (
              <Row
                key={i}
                alignSelf="stretch"
                alignItems="center"
                padding={10}
                borderLeft={i !== 0 ? `1px solid ${colors.slate['200']}` : null}
              >
                {label}
              </Row>
            )
          )}
        </Block>

        {networkEventPairs.map(([prev, group], i) => (
          <Fragment key={i}>
            <Block gridColumn="1 / span 7">
              <ElapsedMarker
                prevIndex={prev ? getStartIndex(prev) : -1}
                nextIndex={
                  group ? getStartIndex(group) : Number.MAX_SAFE_INTEGER
                }
              />
            </Block>

            {group !== null && (
              <NetworkRow
                key={i}
                eventGroup={group}
                selected={group === selectedGroup}
                onSelect={() => setSelectedGroup(group)}
              />
            )}
          </Fragment>
        ))}
      </Grid>

      {selectedGroup && (
        <DetailsOverlay
          key={
            selectedGroup.type === 'fetch'
              ? selectedGroup.requestIndex
              : selectedGroup.openIndex
          }
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
        />
      )}
    </Grid>
  )
}
