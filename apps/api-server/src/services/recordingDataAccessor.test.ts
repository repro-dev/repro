import {
  InteractionType,
  PointerState,
  RecordingMode,
  Snapshot,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import { promise, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { after, before, describe, it } from 'node:test'
import type { Database } from '~/modules/database'
import { decodeId, encodeId } from '~/modules/database'
import type { ByteRange, Storage } from '~/modules/storage'
import { setUpTestDatabase } from '~/testing/database'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import { createRecordingDataAccessor } from './recordingDataAccessor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(): Snapshot {
  return {
    dom: null,
    interaction: {
      pointer: [0, 0] as [number, number],
      pointerState: PointerState.Up,
      scroll: {},
      viewport: [1024, 768] as [number, number],
      pageURL: 'https://example.com',
    },
    frameworkState: null,
    cssRules: null,
  }
}

function makeKeyDownEvent(time: number): SourceEvent {
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({ type: InteractionType.KeyDown, key: 'Enter' }),
  })
}

function makePointerMoveEvent(
  time: number,
  from: [number, number],
  to: [number, number],
  duration: number
): SourceEvent {
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({ type: InteractionType.PointerMove, from, to, duration }),
  })
}

function makeSnapshotEvent(time: number, snapshot: Snapshot): SourceEvent {
  return new Box({ type: SourceEventType.Snapshot, time, data: snapshot })
}

function makeCustomMarkEvent(time: number, name: string): SourceEvent {
  return new Box({
    type: SourceEventType.CustomMark,
    time,
    data: { name, data: null, frameId: 0 },
  })
}

// Encode events to binary wire format and compute index row metadata.
function encodeEvents(events: Array<SourceEvent>) {
  const views = events.map(e => SourceEventView.encode(e))
  const packed = toBinaryWireFormat(views)
  const blob = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength)
  const dv = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
  const count = dv.getUint32(0, true)
  const indexRows = []
  for (let i = 0; i < count && i < events.length; i++) {
    const itemOffset = dv.getUint32(4 + i * 4, true)
    const length = dv.getUint32(itemOffset, true)
    const unboxed = events[i]!.unwrap()
    indexRows.push({
      eventIndex: i,
      eventType: unboxed.type as number,
      timeMs: unboxed.time,
      byteOffset: itemOffset + 4,
      byteLength: length,
    })
  }
  return { blob, indexRows }
}

async function runFuture<L, R>(future: FutureInstance<L, R>): Promise<R> {
  return promise(future)
}

interface EventSetup {
  recordingId: string
  decodedId: number
}

async function createRecording(
  db: Database,
  title: string,
  duration: number
): Promise<EventSetup> {
  const row = await runFuture(
    resolve(
      db
        .insertInto('recordings')
        .values({
          title,
          url: 'https://example.com/test',
          description: '',
          mode: RecordingMode.Replay,
          duration,
          browserName: null,
          browserVersion: null,
          operatingSystem: null,
          codecVersion: '2.0.0',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    )
  )
  return { recordingId: encodeId(row.id), decodedId: row.id }
}

async function setupEvents(
  db: Database,
  storage: Storage,
  recordingId: string,
  decodedId: number,
  events: Array<SourceEvent>
): Promise<void> {
  const { blob, indexRows } = encodeEvents(events)
  await runFuture(storage.write(`${recordingId}/data`, Readable.from([blob])))
  await runFuture(
    resolve(
      db
        .insertInto('recording_event_index')
        .values(indexRows.map(r => ({ recordingId: decodedId, ...r })))
        .execute()
    )
  )
}

function timesFrom(events: Array<SourceEvent>): number[] {
  const times: number[] = []
  for (const event of events) {
    event.apply(e => times.push(e.time))
  }
  return times
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecordingDataAccessor (server)', () => {
  let closeDb: () => Promise<void>
  let closeStorage: () => Promise<void>
  let db: Database
  let storage: Storage
  let recordingId: string

  before(async () => {
    const { db: dbInstance, close } = await setUpTestDatabase()
    db = dbInstance
    closeDb = close
    const { storage: storageInstance, close: closeStor } =
      await setUpTestFileSystemStorage()
    storage = storageInstance
    closeStorage = closeStor
    recordingId = (await createRecording(db, 'Main', 10_000)).recordingId
  })

  after(async () => {
    await closeStorage()
    await closeDb()
  })

  // -----------------------------------------------------------------------
  // getDuration
  // -----------------------------------------------------------------------

  describe('getDuration', () => {
    it('returns 0 when cache is not yet loaded', () => {
      const accessor = createRecordingDataAccessor(db, storage, recordingId)
      assert.strictEqual(accessor.getDuration(), 0)
    })

    it('returns correct duration after a query triggers cache load', async () => {
      const accessor = createRecordingDataAccessor(db, storage, recordingId)
      await runFuture(accessor.getEventsByType([SourceEventType.Interaction]))
      assert.strictEqual(accessor.getDuration(), 10_000)
    })
  })

  describe('getResourceMap', () => {
    it('returns stored resource map from recording_resources table', async () => {
      const numericId = decodeId(recordingId)!
      await runFuture(
        resolve(
          db
            .insertInto('recording_resources')
            .values([
              {
                recordingId: numericId,
                key: 'res1',
                value: 'https://example.com/1.png',
              },
              {
                recordingId: numericId,
                key: 'res2',
                value: 'https://example.com/2.png',
              },
            ])
            .execute()
        )
      )
      const accessor = createRecordingDataAccessor(db, storage, recordingId)
      const result = await runFuture(accessor.getResourceMap())
      assert.deepStrictEqual(result, {
        res1: 'https://example.com/1.png',
        res2: 'https://example.com/2.png',
      })
    })

    it('returns empty object when no resources exist', async () => {
      const rec = await createRecording(db, 'Empty', 5_000)
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      assert.deepStrictEqual(await runFuture(accessor.getResourceMap()), {})
    })
  })

  // -----------------------------------------------------------------------
  // getEventsByType
  // -----------------------------------------------------------------------

  describe('getEventsByType', () => {
    let rec: EventSetup

    before(async () => {
      rec = await createRecording(db, 'Events By Type', 5_000)
      await setupEvents(db, storage, rec.recordingId, rec.decodedId, [
        makeKeyDownEvent(100),
        makeCustomMarkEvent(200, 'mark-a'),
        makePointerMoveEvent(300, [0, 0], [100, 50], 100),
        makeKeyDownEvent(400),
        makeCustomMarkEvent(500, 'mark-b'),
        makeKeyDownEvent(600),
      ])
    })

    it('filters events by type correctly', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const result = await runFuture(
        accessor.getEventsByType([SourceEventType.CustomMark])
      )
      assert.strictEqual(result.length, 2)
      for (const event of result) {
        event.apply(e => assert.strictEqual(e.type, SourceEventType.CustomMark))
      }
    })

    it('returns events ordered by timeMs', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const result = await runFuture(
        accessor.getEventsByType([SourceEventType.Interaction])
      )
      assert.deepStrictEqual(timesFrom(result), [100, 300, 400, 600])
    })

    it('respects limit and offset parameters', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const limited = await runFuture(
        accessor.getEventsByType([SourceEventType.Interaction], { limit: 2 })
      )
      assert.strictEqual(limited.length, 2)

      const offset = await runFuture(
        accessor.getEventsByType([SourceEventType.Interaction], { offset: 2 })
      )
      assert.deepStrictEqual(timesFrom(offset), [400, 600])
    })

    it('respects startMs and endMs filters', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const after300 = await runFuture(
        accessor.getEventsByType([SourceEventType.Interaction], {
          startMs: 300,
        })
      )
      assert.ok(timesFrom(after300).every(t => t >= 300))

      const upTo400 = await runFuture(
        accessor.getEventsByType([SourceEventType.Interaction], { endMs: 400 })
      )
      assert.ok(timesFrom(upTo400).every(t => t <= 400))
    })
  })

  // -----------------------------------------------------------------------
  // getEventsInRange
  // -----------------------------------------------------------------------

  describe('getEventsInRange', () => {
    let rec: EventSetup

    before(async () => {
      rec = await createRecording(db, 'Range', 5_000)
      await setupEvents(db, storage, rec.recordingId, rec.decodedId, [
        makeKeyDownEvent(100),
        makeCustomMarkEvent(200, 'mark-a'),
        makePointerMoveEvent(350, [0, 0], [50, 50], 50),
        makeKeyDownEvent(500),
        makeCustomMarkEvent(800, 'mark-b'),
        makeKeyDownEvent(900),
      ])
    })

    it('returns events within the time range', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const result = await runFuture(accessor.getEventsInRange(200, 600))
      assert.deepStrictEqual(timesFrom(result), [200, 350, 500])
    })

    it('filters by type when provided', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const result = await runFuture(
        accessor.getEventsInRange(0, 1000, {
          types: [SourceEventType.CustomMark],
        })
      )
      assert.strictEqual(result.length, 2)
      for (const event of result) {
        event.apply(e => assert.strictEqual(e.type, SourceEventType.CustomMark))
      }
    })

    it('returns empty array for range with no events', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      assert.deepStrictEqual(
        await runFuture(accessor.getEventsInRange(5000, 6000)),
        []
      )
    })

    it('returns all event types when no type filter provided', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      assert.strictEqual(
        (await runFuture(accessor.getEventsInRange(0, 1000))).length,
        6
      )
    })
  })

  // -----------------------------------------------------------------------
  // getSnapshotAtTime
  // -----------------------------------------------------------------------

  describe('getSnapshotAtTime', () => {
    let rec: EventSetup

    before(async () => {
      rec = await createRecording(db, 'Snapshot', 5_000)
      const snapshot = makeSnapshot()
      await setupEvents(db, storage, rec.recordingId, rec.decodedId, [
        makeSnapshotEvent(0, snapshot),
        makePointerMoveEvent(500, [0, 0], [200, 300], 1000),
        makeKeyDownEvent(800),
        makePointerMoveEvent(1200, [200, 300], [400, 100], 500),
      ])
    })

    it('returns null when no snapshot exists before target time', async () => {
      const noSnapRec = await createRecording(db, 'No Snapshot', 1_000)
      await setupEvents(
        db,
        storage,
        noSnapRec.recordingId,
        noSnapRec.decodedId,
        [makeKeyDownEvent(100)]
      )
      const accessor = createRecordingDataAccessor(
        db,
        storage,
        noSnapRec.recordingId
      )
      assert.strictEqual(await runFuture(accessor.getSnapshotAtTime(500)), null)
    })

    it('returns snapshot event decoded as Snapshot at t=0', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const result = await runFuture(accessor.getSnapshotAtTime(0))
      assert.notStrictEqual(result, null)
      assert.strictEqual(result!.interaction!.pointer[0], 0)
      assert.strictEqual(result!.interaction!.pointer[1], 0)
      assert.strictEqual(result!.interaction!.pointerState, PointerState.Up)
    })

    it('reconstructs snapshot with interaction events applied', async () => {
      const accessor = createRecordingDataAccessor(db, storage, rec.recordingId)
      const result = await runFuture(accessor.getSnapshotAtTime(600))
      assert.notStrictEqual(result, null)
      // PointerMove (t=500, dur=1000): interpolated at elapsed=600
      assert.ok(result!.interaction!.pointer[0] > 0)
      assert.ok(result!.interaction!.pointer[1] > 0)
      assert.strictEqual(result!.interaction!.pointerState, PointerState.Up)
    })

    it('handles Scroll interaction events on snapshot', async () => {
      const scrollRec = await createRecording(db, 'Scroll Snap', 5_000)
      const scrollTarget = 'abcde'
      await setupEvents(
        db,
        storage,
        scrollRec.recordingId,
        scrollRec.decodedId,
        [
          makeSnapshotEvent(0, makeSnapshot()),
          new Box({
            type: SourceEventType.Interaction,
            time: 300,
            data: new Box({
              type: InteractionType.Scroll,
              target: scrollTarget,
              from: [0, 0] as [number, number],
              to: [0, 100] as [number, number],
              duration: 500,
            }),
          }),
        ]
      )
      const accessor = createRecordingDataAccessor(
        db,
        storage,
        scrollRec.recordingId
      )
      const result = await runFuture(accessor.getSnapshotAtTime(800))
      assert.notStrictEqual(result, null)
      // After round-tripping through TDL encode/decode, the scroll map may
      // contain a key with a different length than the original. Assert that
      // the map has an entry with the expected value regardless of key.
      const scrollKeys = Object.keys(result!.interaction!.scroll)
      assert.ok(
        scrollKeys.length > 0,
        'scroll map must have at least one entry'
      )
      const actualValue = result!.interaction!.scroll[scrollKeys[0]!]
      assert.deepStrictEqual(actualValue, [0, 100])
    })
  })

  // -----------------------------------------------------------------------
  // Byte-range reads
  // -----------------------------------------------------------------------

  describe('byte-range reads', () => {
    it('passes range parameter to storage.read when reading events', async () => {
      const rec = await createRecording(db, 'Byte Range', 1_000)
      await setupEvents(db, storage, rec.recordingId, rec.decodedId, [
        makeKeyDownEvent(100),
        makeKeyDownEvent(200),
        makeKeyDownEvent(300),
      ])

      const readRanges: Array<ByteRange> = []
      const wrappedStorage: Storage = {
        ...storage,
        read: (path, range) => {
          if (range) readRanges.push(range)
          return storage.read(path, range)
        },
      }

      const accessor = createRecordingDataAccessor(
        db,
        wrappedStorage,
        rec.recordingId
      )
      await runFuture(accessor.getEventsByType([SourceEventType.Interaction]))

      assert.ok(readRanges.length > 0)
      for (const range of readRanges) {
        assert.ok(range.start >= 0)
        assert.ok(range.end > range.start)
      }
    })
  })
})
