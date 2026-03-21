import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fork, resolve } from 'fluture'
import { Readable } from 'node:stream'
import {
  ConsoleEventView,
  LogLevel,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { List } from '@repro/tdl'
import { toBinaryWireFormat } from '@repro/wire-formats'
import { StorageClient } from '~/modules/storage'
import { loadRecordingData } from './loadRecordingData'

function makeTestEvents(count: number): DataView[] {
  const result: DataView[] = []
  for (let i = 0; i < count; i++) {
    const event = ConsoleEventView.encode({
      type: SourceEventType.Console,
      time: i * 1000,
      data: { level: LogLevel.Info, parts: [], stack: [] },
    })
    result.push(event)
  }
  return result
}

function makeReadable(dataViews: DataView[]): Readable {
  const encoded = toBinaryWireFormat(dataViews)
  const buf = Buffer.from(
    encoded.buffer,
    encoded.byteOffset,
    encoded.byteLength
  )
  return Readable.from([buf])
}

function forkToPromise<T>(future: ReturnType<typeof loadRecordingData>): Promise<T> {
  return new Promise((resolveP, rejectP) => {
    fork((err: Error) => rejectP(err))((value: T) => resolveP(value))(future as never)
  })
}

describe('loadRecordingData', () => {
  it('returns an empty List when storage returns no events', async () => {
    const storage: StorageClient = {
      read: _path => resolve(makeReadable([])),
    }

    const list = await forkToPromise<List<typeof SourceEventView>>(
      loadRecordingData(storage, 'test-recording-id')
    )
    assert.equal(list.size(), 0)
  })

  it('reads from the correct storage path', async () => {
    const paths: string[] = []
    const storage: StorageClient = {
      read: path => {
        paths.push(path)
        return resolve(makeReadable([]))
      },
    }

    await forkToPromise<List<typeof SourceEventView>>(
      loadRecordingData(storage, 'my-recording-id')
    )
    assert.equal(paths.length, 1)
    assert.equal(paths[0], 'my-recording-id/data')
  })

  it('returns a List with the correct number of DataViews', async () => {
    const dv = makeTestEvents(3)
    const storage: StorageClient = {
      read: _path => resolve(makeReadable(dv)),
    }

    const list = await forkToPromise<List<typeof SourceEventView>>(
      loadRecordingData(storage, 'test-recording-id')
    )
    assert.equal(list.size(), 3)
  })
})
