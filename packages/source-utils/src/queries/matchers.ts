import {
  ConsoleEvent,
  LogLevel,
  NetworkEvent,
  NetworkMessageType,
  SnapshotEvent,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { type Sample } from '../types'

export function isConsoleEvent(event: SourceEvent): event is Box<ConsoleEvent> {
  return event.match(event => event.type === SourceEventType.Console)
}

export function isConsoleErrorEvent(
  event: SourceEvent
): event is Box<ConsoleEvent> {
  return (
    isConsoleEvent(event) &&
    event
      .get('data')
      .get('level')
      .match(level => level === LogLevel.Error)
  )
}

export function isNetworkEvent(event: SourceEvent): event is Box<NetworkEvent> {
  return event.match(event => event.type === SourceEventType.Network)
}

export function isNetworkErrorResponseEvent(
  event: SourceEvent
): event is Box<NetworkEvent> {
  return (
    isNetworkEvent(event) &&
    event
      .flatMap(event => event.data)
      .match(
        data =>
          data.type === NetworkMessageType.FetchResponse && data.status >= 400
      )
  )
}

export function isSnapshotEvent(
  event: SourceEvent
): event is Box<SnapshotEvent> {
  return event.match(event => event.type === SourceEventType.Snapshot)
}

export function isSample(data: Box<object>): data is Box<Sample<any>> {
  return data.match(
    data => 'from' in data && 'to' in data && 'duration' in data
  )
}
