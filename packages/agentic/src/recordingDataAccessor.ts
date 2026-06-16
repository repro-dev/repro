import { SourceEvent, SourceEventType } from '@repro/domain'
import { resolve } from 'fluture'
import { RecordingDataAccessor } from './types'

export interface EventList {
  size(): number
  over(index: number): SourceEvent | null
}

export function makeAccessorFromEventList(
  events: EventList
): Pick<RecordingDataAccessor, 'getEventsByType' | 'getEventsInRange'> {
  return {
    getEventsByType(
      types: Array<SourceEventType>,
      opts?: {
        startMs?: number
        endMs?: number
        limit?: number
        offset?: number
      }
    ) {
      const results: Array<SourceEvent> = []
      const offset = opts?.offset ?? 0
      const limit = opts?.limit ?? Infinity
      let count = 0
      let skipped = 0
      for (let i = 0, len = events.size(); i < len; i++) {
        const event = events.over(i)
        if (!event) continue
        const time = event.get('time').orElse(0)
        if (opts?.startMs !== undefined && time < opts.startMs) continue
        if (opts?.endMs !== undefined && time > opts.endMs) break
        const type = event.get('type').orElse(-1)
        if (!types.includes(type as SourceEventType)) continue
        if (skipped < offset) {
          skipped++
          continue
        }
        if (count >= limit) break
        results.push(event)
        count++
      }
      return resolve(results)
    },

    getEventsInRange(
      startMs: number,
      endMs: number,
      opts?: {
        types?: Array<SourceEventType>
        limit?: number
        offset?: number
      }
    ) {
      const results: Array<SourceEvent> = []
      const offset = opts?.offset ?? 0
      const limit = opts?.limit ?? Infinity
      let count = 0
      let skipped = 0
      for (let i = 0, len = events.size(); i < len; i++) {
        const event = events.over(i)
        if (!event) continue
        const time = event.get('time').orElse(0)
        if (time < startMs) continue
        if (time > endMs) break
        if (opts?.types && opts.types.length > 0) {
          const type = event.get('type').orElse(-1)
          if (!opts.types.includes(type as SourceEventType)) continue
        }
        if (skipped < offset) {
          skipped++
          continue
        }
        if (count >= limit) break
        results.push(event)
        count++
      }
      return resolve(results)
    },
  }
}
