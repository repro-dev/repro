import {
  Snapshot,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { applyEventToSnapshot } from '@repro/source-utils'
import Future, {
  chain,
  FutureInstance,
  go,
  map,
  parallel,
  reject,
  resolve,
} from 'fluture'
import { Readable } from 'node:stream'
import { attemptQuery, Database, decodeId } from '~/modules/database'
import { Storage } from '~/modules/storage'
import { notFound } from '~/utils/errors'

// Inline the RecordingDataAccessor interface to avoid pulling @repro/agentic
// (which includes browser-only packages) into the server-side dependency graph.
interface RecordingDataAccessor {
  getDuration(): number
  getSnapshotAtTime(timestampMs: number): FutureInstance<Error, Snapshot | null>
  getResourceMap(): FutureInstance<Error, Record<string, string>>
  getEventsByType(
    types: Array<SourceEventType>,
    opts?: {
      startMs?: number
      endMs?: number
      limit?: number
      offset?: number
    }
  ): FutureInstance<Error, Array<SourceEvent>>
  getEventsInRange(
    startMs: number,
    endMs: number,
    opts?: {
      types?: Array<SourceEventType>
      limit?: number
      offset?: number
    }
  ): FutureInstance<Error, Array<SourceEvent>>
}

function getObjectBytes(readable: Readable): FutureInstance<Error, Buffer> {
  return Future<Error, Buffer>((rej, res) => {
    const chunks: Buffer[] = []
    readable.on('data', (chunk: Buffer) => chunks.push(chunk))
    readable.on('end', () => res(Buffer.concat(chunks)))
    readable.on('error', rej)
    return () => readable.destroy()
  })
}

interface EventIndexRow {
  eventIndex: number
  eventType: number
  timeMs: number
  byteOffset: number
  byteLength: number
}

function queryEventIndex(
  database: Database,
  recordingId: string,
  filters: {
    eventTypes?: number[]
    startMs?: number
    endMs?: number
    limit?: number
    offset?: number
    orderBy?: 'asc' | 'desc'
  }
): FutureInstance<Error, Array<EventIndexRow>> {
  const decodedRecordingId = decodeId(recordingId)

  if (decodedRecordingId == null) {
    return reject(notFound(`Invalid recording ID "${recordingId}"`))
  }

  return attemptQuery(() => {
    let query = database
      .selectFrom('recording_event_index')
      .select(['eventIndex', 'eventType', 'timeMs', 'byteOffset', 'byteLength'])
      .where('recordingId', '=', decodedRecordingId)

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      query = query.where('eventType', 'in', filters.eventTypes)
    }

    if (filters.startMs !== undefined) {
      query = query.where('timeMs', '>=', filters.startMs)
    }

    if (filters.endMs !== undefined) {
      query = query.where('timeMs', '<=', filters.endMs)
    }

    const order = filters.orderBy ?? 'asc'
    query = query.orderBy('timeMs', order)

    if (filters.limit !== undefined) {
      query = query.limit(filters.limit)
    }

    if (filters.offset !== undefined) {
      query = query.offset(filters.offset)
    }

    return query.execute()
  })
}

// Merge overlapping/adjacent byte ranges to minimize S3 requests
function mergeRanges(
  ranges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!
    const last = merged[merged.length - 1]!

    if (current.start <= last.end + 1) {
      // Overlapping or adjacent — merge
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }

  return merged
}

// Read a byte range from storage and decode events from it
function readAndDecodeEvents(
  storage: Storage,
  path: string,
  indexRows: Array<EventIndexRow>
): FutureInstance<Error, Array<SourceEvent>> {
  if (indexRows.length === 0) {
    return resolve([])
  }

  // Compute byte ranges (including 4-byte frame length prefix before each event)
  const rawRanges = indexRows.map(row => ({
    start: row.byteOffset - 4,
    end: row.byteOffset + row.byteLength,
  }))

  const mergedRanges = mergeRanges(rawRanges)

  // Read each merged range and decode events
  const readFutures = mergedRanges.map(range =>
    storage.read(path, range).pipe(chain(stream => getObjectBytes(stream)))
  )

  return parallel(Infinity)(readFutures).pipe(
    map(buffers => {
      const events: Array<SourceEvent> = []

      for (const buffer of buffers) {
        for (const row of indexRows) {
          // Check if this row falls within the current buffer's range
          const bufferStart = buffer.byteOffset
          const bufferEnd = bufferStart + buffer.byteLength
          const rowStart = row.byteOffset - 4
          const rowEnd = row.byteOffset + row.byteLength

          if (rowStart >= bufferStart && rowEnd <= bufferEnd) {
            // Calculate offset within the buffer
            const offsetInBuffer = rowStart - bufferStart
            const eventData = buffer.subarray(
              offsetInBuffer + 4,
              offsetInBuffer + 4 + row.byteLength
            )

            const dataView = new DataView(
              eventData.buffer,
              eventData.byteOffset,
              eventData.byteLength
            )

            const decoded = SourceEventView.decode(dataView)
            events.push(decoded as unknown as SourceEvent)
          }
        }
      }

      // Sort by timeMs to maintain event order
      events.sort((a, b) => {
        const timeA = (a as unknown as { time: number }).time ?? 0
        const timeB = (b as unknown as { time: number }).time ?? 0
        return timeA - timeB
      })

      return events
    })
  )
}

export function createRecordingDataAccessor(
  database: Database,
  storage: Storage,
  recordingId: string
): RecordingDataAccessor {
  const storagePath = `${recordingId}/data`

  // getDuration: cached from DB query
  let durationCache: number | null = null

  function ensureDurationLoaded(): FutureInstance<Error, number> {
    if (durationCache !== null) {
      return resolve(durationCache)
    }

    return attemptQuery(() => {
      return database
        .selectFrom('recordings')
        .select('duration')
        .where('id', '=', decodeId(recordingId))
        .executeTakeFirstOrThrow(() =>
          notFound(`Recording not found: ${recordingId}`)
        )
    }).pipe(
      map(row => {
        durationCache = row.duration
        return row.duration
      })
    )
  }

  // getResourceMap: cached from DB query
  let resourceMapCache: Record<string, string> | null = null

  function ensureResourceMapLoaded(): FutureInstance<
    Error,
    Record<string, string>
  > {
    if (resourceMapCache !== null) {
      return resolve(resourceMapCache)
    }

    const decodedRecordingId = decodeId(recordingId)

    if (decodedRecordingId == null) {
      return reject(notFound(`Invalid recording ID "${recordingId}"`))
    }

    return attemptQuery(() => {
      return database
        .selectFrom('recording_resources')
        .where('recordingId', '=', decodedRecordingId)
        .select(['key', 'value'])
        .execute()
    }).pipe(
      map(rows => {
        resourceMapCache = Object.fromEntries(
          rows.map(row => [row.key, row.value])
        )
        return resourceMapCache
      })
    )
  }

  return {
    getDuration(): number {
      // If cache is loaded, return it; otherwise 0 (caller should handle)
      return durationCache ?? 0
    },

    getSnapshotAtTime(
      timestampMs: number
    ): FutureInstance<Error, Snapshot | null> {
      return go(function* () {
        // Find nearest snapshot event at or before timestampMs
        const snapshotRows = yield queryEventIndex(database, recordingId, {
          eventTypes: [SourceEventType.Snapshot as number],
          endMs: timestampMs,
          orderBy: 'desc',
          limit: 1,
        })

        if (snapshotRows.length === 0) {
          return null
        }

        const snapshotRow = snapshotRows[0]!

        // Find DOMPatch and Interaction events between snapshot and target time
        const patchRows = yield queryEventIndex(database, recordingId, {
          eventTypes: [
            SourceEventType.DOMPatch as number,
            SourceEventType.Interaction as number,
          ],
          startMs: snapshotRow.timeMs,
          endMs: timestampMs,
          orderBy: 'asc',
        })

        // Single byte-range read of all events
        const allEventRows = [snapshotRow, ...patchRows]
        const events = yield readAndDecodeEvents(
          storage,
          storagePath,
          allEventRows
        )

        if (events.length === 0) {
          return null
        }

        // First event should be the snapshot
        const snapshotEvent = events[0]!

        // Decode snapshot from the event
        let snapshot = snapshotEvent as unknown as Snapshot

        // Apply subsequent events to reconstruct state at target time
        for (let i = 1; i < events.length; i++) {
          const event = events[i]!
          const elapsed =
            (event as unknown as { time: number }).time ?? timestampMs
          applyEventToSnapshot(snapshot, event, elapsed)
        }

        return snapshot
      })
    },

    getResourceMap(): FutureInstance<Error, Record<string, string>> {
      return ensureResourceMapLoaded()
    },

    getEventsByType(
      types: Array<SourceEventType>,
      opts?: {
        startMs?: number
        endMs?: number
        limit?: number
        offset?: number
      }
    ): FutureInstance<Error, Array<SourceEvent>> {
      return go(function* () {
        // Load duration for default endMs
        if (opts?.endMs === undefined) {
          const duration = yield ensureDurationLoaded()
          opts = { ...opts, endMs: duration > 0 ? duration : undefined }
        }

        const rows = yield queryEventIndex(database, recordingId, {
          eventTypes: types.map(t => t as number),
          startMs: opts?.startMs,
          endMs: opts?.endMs,
          limit: opts?.limit,
          offset: opts?.offset,
        })

        return yield readAndDecodeEvents(storage, storagePath, rows)
      })
    },

    getEventsInRange(
      startMs: number,
      endMs: number,
      opts?: {
        types?: Array<SourceEventType>
        limit?: number
        offset?: number
      }
    ): FutureInstance<Error, Array<SourceEvent>> {
      return go(function* () {
        const rows = yield queryEventIndex(database, recordingId, {
          eventTypes: opts?.types?.map(t => t as number),
          startMs,
          endMs,
          limit: opts?.limit,
          offset: opts?.offset,
        })

        return yield readAndDecodeEvents(storage, storagePath, rows)
      })
    },
  }
}
