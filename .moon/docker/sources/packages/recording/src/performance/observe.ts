import {
  PerformanceEntry as PerformanceEntryData,
  PerformanceEntryType,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { randomString } from '@repro/random-string'
import { Box } from '@repro/tdl'

function isResourceTimingEntry(
  entry: PerformanceEntry
): entry is PerformanceResourceTiming {
  return entry.entryType === 'resource'
}

export function createPerformanceObserver(
  subscriber: (entry: PerformanceEntryData) => void
): ObserverLike {
  const resourceTimingObserver = createResourceTimingObserver(subscriber)

  return {
    observe(doc, vtree) {
      resourceTimingObserver.observe(doc, vtree)
    },

    disconnect() {
      resourceTimingObserver.disconnect()
    },
  }
}

function createResourceTimingObserver(
  subscriber: (entry: PerformanceEntryData) => void
): ObserverLike<PerformanceEntry> {
  function captureResourceTimings(entries: Array<PerformanceEntry>) {
    for (const entry of entries) {
      if (isResourceTimingEntry(entry)) {
        subscriber(
          new Box({
            type: PerformanceEntryType.ResourceTiming,
            id: randomString(4),
            initiatorType: entry.initiatorType,
            url: entry.name,
            startTime: entry.startTime,
            domainLookupStart: entry.domainLookupStart,
            domainLookupEnd: entry.domainLookupEnd,
            connectStart: entry.connectStart,
            secureConnectionStart: entry.secureConnectionStart,
            connectEnd: entry.connectEnd,
            requestStart: entry.requestStart,
            responseStart: entry.responseStart,
            responseEnd: entry.responseEnd,
            encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize,
            transferSize: entry.transferSize,
          })
        )
      }
    }
  }

  const resourceTimingObserver = new PerformanceObserver(list => {
    captureResourceTimings(list.getEntries())
  })

  return {
    disconnect: () => resourceTimingObserver.disconnect(),
    observe() {
      resourceTimingObserver.observe({
        type: 'resource',
        buffered: true,
      })
    },
  }
}
