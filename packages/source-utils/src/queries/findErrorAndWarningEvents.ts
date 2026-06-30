import {
  ConsoleEvent,
  DateMessagePart,
  LogLevel,
  MessagePartType,
  NodeMessagePart,
  SourceEventView,
  StringMessagePart,
  UndefinedMessagePart,
} from '@repro/domain'
import { Box, List } from '@repro/tdl'
import { findIndexedNetworkEvents } from './findIndexedNetworkEvents'
import { groupNetworkEvents } from './groupNetworkEvents'
import { isConsoleEvent } from './matchers'

export interface ErrorOrWarningEntry {
  time: number
  severity: 'error' | 'warning'
  category: 'console' | 'network'
  summary: string
}

export function findErrorAndWarningEvents(
  events: List<SourceEventView>
): Array<ErrorOrWarningEntry> {
  const entries: Array<ErrorOrWarningEntry> = []

  // Scan console events for errors and warnings
  for (let i = 0, len = events.size(); i < len; i++) {
    const event = events.over(i)

    if (event && isConsoleEvent(event)) {
      const consoleEvent = event as Box<ConsoleEvent>

      consoleEvent.apply(ce => {
        if (ce.data.level === LogLevel.Error) {
          entries.push({
            time: ce.time,
            severity: 'error',
            category: 'console',
            summary: extractConsoleSummary(consoleEvent),
          })
        } else if (ce.data.level === LogLevel.Warning) {
          entries.push({
            time: ce.time,
            severity: 'warning',
            category: 'console',
            summary: extractConsoleSummary(consoleEvent),
          })
        }
      })
    }
  }

  // Scan network events for errors via grouping
  const indexedNetworkEvents = findIndexedNetworkEvents(events)
  const groupedNetworkEvents = groupNetworkEvents(indexedNetworkEvents)

  for (const group of groupedNetworkEvents) {
    if (
      group.type === 'fetch' &&
      group.response &&
      group.response.status >= 400
    ) {
      entries.push({
        time: group.responseTime ?? group.requestTime,
        severity: 'error',
        category: 'network',
        summary: `${group.request.method} ${group.request.url} → ${group.response.status}`,
      })
    } else if (group.type === 'ws' && group.error) {
      entries.push({
        time: group.errorTime ?? group.openTime,
        severity: 'error',
        category: 'network',
        summary: `WebSocket error: ${group.open.url}`,
      })
    }
  }

  // Sort by time ascending
  return entries.sort((a, b) => a.time - b.time)
}

function extractConsoleSummary(event: Box<ConsoleEvent>): string {
  const parts = event.get('data').get('parts').orElse([])
  const textParts: Array<string> = []

  for (const part of parts) {
    part.apply(
      (
        p:
          | StringMessagePart
          | NodeMessagePart
          | UndefinedMessagePart
          | DateMessagePart
      ) => {
        switch (p.type) {
          case MessagePartType.String:
            textParts.push(p.value)
            break
          case MessagePartType.Node:
            textParts.push('[Node]')
            break
          case MessagePartType.Date:
            textParts.push('[Date]')
            break
          case MessagePartType.Undefined:
            textParts.push('undefined')
            break
        }
      }
    )
  }

  const summary = textParts.join(' ')
  return summary.length > 200 ? summary.slice(0, 200) + '...' : summary
}
