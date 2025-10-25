import { Block, Grid, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { Stats } from '@repro/diagnostics'
import {
  NetworkEvent,
  NetworkMessageType,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { ControlFrame, ElapsedMarker, usePlayback } from '@repro/playback'
import { Box } from '@repro/tdl'
import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { filter } from 'rxjs'
import { pairwise } from '../utils'
import { DetailsOverlay } from './DetailsOverlay'
import { NetworkRow } from './NetworkRow'
import { FetchGroup, WebSocketGroup } from './types'

function isNetworkEvent(event: SourceEvent): event is Box<NetworkEvent> {
  return event.match(event => event.type === SourceEventType.Network)
}

function groupNetworkEvents(
  events: Array<[NetworkEvent, number]>
): Array<FetchGroup | WebSocketGroup> {
  const groups: Record<string, FetchGroup | WebSocketGroup> = {}
  const orderedGroupIds: Array<string> = []

  for (const [event, index] of events) {
    event.data.apply(data => {
      let group = groups[data.correlationId]

      if (!group) {
        switch (data.type) {
          case NetworkMessageType.FetchRequest:
            group = {
              type: 'fetch',
              requestTime: event.time,
              requestIndex: index,
              request: data,
            }

            orderedGroupIds.push(data.correlationId)
            break

          case NetworkMessageType.WebSocketOpen:
            group = {
              type: 'ws',
              openTime: event.time,
              openIndex: index,
              open: data,
            }

            orderedGroupIds.push(data.correlationId)
            break
        }
      }

      if (!group) {
        return
      }

      switch (data.type) {
        case NetworkMessageType.FetchResponse:
          ;(group as FetchGroup).response = data
          ;(group as FetchGroup).responseTime = event.time
          ;(group as FetchGroup).responseIndex = index
          break

        case NetworkMessageType.WebSocketClose:
          ;(group as WebSocketGroup).close = data
          ;(group as WebSocketGroup).closeTime = event.time
          ;(group as WebSocketGroup).closeIndex = index
          break

        case NetworkMessageType.WebSocketInbound:
        case NetworkMessageType.WebSocketOutbound:
          const messages = (group as WebSocketGroup).messages || []
          messages.push({
            index,
            time: event.time,
            data,
          })
          ;(group as WebSocketGroup).messages = messages
          break
      }

      groups[data.correlationId] = group
    })
  }

  const orderedGroups: Array<FetchGroup | WebSocketGroup> = []

  for (const groupId of orderedGroupIds) {
    const group = groups[groupId]

    if (group) {
      orderedGroups.push(group)
    }
  }

  return orderedGroups
}

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
        const events: Array<[NetworkEvent, number]> = []
        const sourceEvents = playback.getSourceEvents().toSource()
        let i = 0

        for (const view of sourceEvents) {
          const event = SourceEventView.over(view)

          if (isNetworkEvent(event)) {
            event.apply(event => {
              events.push([event, i])
            })
          }

          i++
        }

        return groupNetworkEvents(events)
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
