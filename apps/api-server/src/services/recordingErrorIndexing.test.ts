import {
  LogLevel,
  MessagePartType,
  RecordingMode,
  SourceEventType,
  SourceEventView,
  StackEntry,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import expect from 'expect'
import { promise } from 'fluture'
import { Readable } from 'node:stream'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Database, encodeId } from '~/modules/database'
import { setUpTestDatabase } from '~/testing/database'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import {
  computeFingerprint,
  createRecordingErrorIndexingService,
} from './recordingErrorIndexing'

function createConsoleErrorEvent(
  message: string,
  stack: Array<StackEntry>,
  time: number = 1000
) {
  return new Box({
    type: SourceEventType.Console,
    time,
    data: {
      level: LogLevel.Error,
      parts: [
        new Box({
          type: MessagePartType.String,
          value: message,
        }),
      ],
      stack,
    },
  })
}

function createConsoleInfoEvent(message: string, time: number = 2000) {
  return new Box({
    type: SourceEventType.Console,
    time,
    data: {
      level: LogLevel.Info,
      parts: [
        new Box({
          type: MessagePartType.String,
          value: message,
        }),
      ],
      stack: [],
    },
  })
}

function createConsoleWarningEvent(message: string, time: number = 3000) {
  return new Box({
    type: SourceEventType.Console,
    time,
    data: {
      level: LogLevel.Warning,
      parts: [
        new Box({
          type: MessagePartType.String,
          value: message,
        }),
      ],
      stack: [],
    },
  })
}

function makeStackEntry(overrides: Partial<StackEntry> = {}): StackEntry {
  return {
    functionName: null,
    fileName: 'https://example.com/app.js',
    lineNumber: 1,
    columnNumber: 42,
    ...overrides,
  }
}

/**
 * Encode SourceEvent(s) into binary wire format buffer (as a Buffer)
 */
function encodeSourceEventsToBuffer(events: Array<Box<any>>): Buffer {
  const encoded = events.map(event => SourceEventView.encode(event))
  const wireFormat = toBinaryWireFormat(encoded)
  return Buffer.from(wireFormat.buffer)
}

async function createRecording(
  db: Database
): Promise<{ id: number; encodedId: string }> {
  const row = await db
    .insertInto('recordings')
    .values({
      title: 'Test Recording',
      url: 'https://example.com',
      description: 'Test recording for error indexing',
      mode: RecordingMode.Replay,
      duration: 5000,
      codecVersion: 'test',
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return { id: row.id, encodedId: encodeId(row.id) }
}

// --- Binding-level test for fingerprinting ---
describe('recordingErrorIndexing > computeFingerprint', () => {
  it('produces the same hash for identical stacks', () => {
    const stack1 = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/a.js',
      }),
      makeStackEntry({
        functionName: 'bar',
        fileName: 'https://example.com/b.js',
      }),
    ]
    const stack2 = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/a.js',
      }),
      makeStackEntry({
        functionName: 'bar',
        fileName: 'https://example.com/b.js',
      }),
    ]
    expect(computeFingerprint(stack1)).toEqual(computeFingerprint(stack2))
  })

  it('produces different hashes for different stacks', () => {
    const stack1 = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/a.js',
      }),
    ]
    const stack2 = [
      makeStackEntry({
        functionName: 'bar',
        fileName: 'https://example.com/a.js',
      }),
    ]
    expect(computeFingerprint(stack1)).not.toEqual(computeFingerprint(stack2))
  })

  it('strips query strings from file names', () => {
    const stack = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/app.js?v=123',
      }),
    ]
    const stackNoQuery = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/app.js',
      }),
    ]
    expect(computeFingerprint(stack)).toEqual(computeFingerprint(stackNoQuery))
  })

  it('is stable for same frames with different line/column numbers', () => {
    const stack1 = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/app.js',
        lineNumber: 10,
        columnNumber: 20,
      }),
    ]
    const stack2 = [
      makeStackEntry({
        functionName: 'foo',
        fileName: 'https://example.com/app.js',
        lineNumber: 100,
        columnNumber: 200,
      }),
    ]
    expect(computeFingerprint(stack1)).toEqual(computeFingerprint(stack2))
  })

  it('coalesces null functionName to empty string', () => {
    const stack1 = [
      makeStackEntry({
        functionName: null,
        fileName: 'https://example.com/app.js',
      }),
    ]
    const stack2 = [
      makeStackEntry({
        functionName: '',
        fileName: 'https://example.com/app.js',
      }),
    ]
    expect(computeFingerprint(stack1)).toEqual(computeFingerprint(stack2))
  })
})

// --- Integration tests ---
describe('Services > Recording error indexing', () => {
  let db: Database
  let close: () => Promise<void>
  let storageHarness: { storage: any; close: () => Promise<void> }
  let storage: any

  before(async () => {
    const dbHarness = await setUpTestDatabase()
    db = dbHarness.db
    close = dbHarness.close
    storageHarness = await setUpTestFileSystemStorage()
    storage = storageHarness.storage
  })

  beforeEach(async () => {
    await db.deleteFrom('recording_errors').execute()
    await db.deleteFrom('recordings').execute()
  })

  after(async () => {
    await storageHarness.close()
    await close()
  })

  it('indexes console error events into recording_errors', async () => {
    const recording = await createRecording(db)
    const errorEvent = createConsoleErrorEvent('Something broke', [
      makeStackEntry({
        functionName: 'handleClick',
        fileName: 'https://example.com/app.js',
      }),
    ])
    const data = encodeSourceEventsToBuffer([errorEvent])

    // Write recording data to storage (use encodedId to match real workflow)
    const writeStream = Readable.from([data])
    await promise(storage.write(`${recording.encodedId}/data`, writeStream))

    const service = createRecordingErrorIndexingService(db, storage)

    await promise(
      service.handler({ recordingId: recording.encodedId }, {} as any)
    )

    const rows = await db.selectFrom('recording_errors').selectAll().execute()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.recordingId).toEqual(recording.id)
    expect(rows[0]?.message).toEqual('Something broke')
    expect(rows[0]?.fingerprint).toBeTruthy()
    expect(rows[0]?.stackHash).toBeTruthy()
    expect(rows[0]?.occurredAt).toBeInstanceOf(Date)
  })

  it('does not index console Info or Warning events', async () => {
    const recording = await createRecording(db)
    const events = [
      createConsoleErrorEvent('Error 1', [
        makeStackEntry({
          functionName: 'fn1',
          fileName: 'https://example.com/a.js',
        }),
      ]),
      createConsoleInfoEvent('Just info'),
      createConsoleWarningEvent('A warning'),
    ]
    const data = encodeSourceEventsToBuffer(events)

    const writeStream = Readable.from([data])
    await promise(storage.write(`${recording.encodedId}/data`, writeStream))

    const service = createRecordingErrorIndexingService(db, storage)

    await promise(
      service.handler({ recordingId: recording.encodedId }, {} as any)
    )

    const rows = await db.selectFrom('recording_errors').selectAll().execute()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.message).toEqual('Error 1')
  })

  it('is idempotent when run multiple times', async () => {
    const recording = await createRecording(db)
    const errorEvent = createConsoleErrorEvent('Idempotent error', [
      makeStackEntry({
        functionName: 'test',
        fileName: 'https://example.com/app.js',
      }),
    ])
    const data = encodeSourceEventsToBuffer([errorEvent])
    const writeStream = Readable.from([data])

    await promise(storage.write(`${recording.encodedId}/data`, writeStream))

    const service = createRecordingErrorIndexingService(db, storage)

    // Run handler twice
    await promise(
      service.handler({ recordingId: recording.encodedId }, {} as any)
    )
    await promise(
      service.handler({ recordingId: recording.encodedId }, {} as any)
    )

    const rows = await db.selectFrom('recording_errors').selectAll().execute()

    expect(rows).toHaveLength(1)
  })

  it('handles empty recording (no events) successfully', async () => {
    const recording = await createRecording(db)
    const data = encodeSourceEventsToBuffer([])
    const writeStream = Readable.from([data])

    await promise(storage.write(`${recording.encodedId}/data`, writeStream))

    const service = createRecordingErrorIndexingService(db, storage)

    await promise(
      service.handler({ recordingId: recording.encodedId }, {} as any)
    )

    const rows = await db.selectFrom('recording_errors').selectAll().execute()

    expect(rows).toHaveLength(0)
  })

  it('rejects malformed recording data with an Error', async () => {
    const recording = await createRecording(db)

    // Write invalid binary data
    const badData = Buffer.from('not-valid-wire-format-data')
    const writeStream = Readable.from([badData])
    await promise(storage.write(`${recording.encodedId}/data`, writeStream))

    const service = createRecordingErrorIndexingService(db, storage)

    await expect(
      promise(service.handler({ recordingId: recording.encodedId }, {} as any))
    ).rejects.toThrow()
  })

  it('propagates error when recording data is missing', async () => {
    const recording = await createRecording(db)

    // Do NOT write any data to storage
    const service = createRecordingErrorIndexingService(db, storage)

    await expect(
      promise(service.handler({ recordingId: recording.encodedId }, {} as any))
    ).rejects.toThrow()
  })
})
