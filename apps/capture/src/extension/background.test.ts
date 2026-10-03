import { RecordingMode } from '@repro/domain'
import { promise, resolve, type FutureInstance } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

type UploadInput = {
  projectId: string
  title: string
  description: string
  url: string
  mode: RecordingMode
  duration: number
  events: Array<unknown>
  browserName: string | null
  browserVersion: string | null
  operatingSystem: string | null
}

const handlers = new Map<
  string,
  (payload: unknown) => FutureInstance<Error, unknown>
>()
const uploads: UploadInput[] = []
const noop = () => {}

mock.module('@repro/analytics', {
  namedExports: {
    Analytics: { setAgent: noop, registerConsumer: noop },
    stubConsumer: {},
  },
})

mock.module('@repro/api-client', {
  namedExports: { createApiClient: () => ({}) },
})

mock.module('@repro/recording-api', {
  namedExports: {
    createUploadWorker: () => ({
      enqueue: (input: UploadInput) => {
        uploads.push(input)
        return `upload-${uploads.length}`
      },
      getProgress: () => null,
    }),
  },
})

mock.module('./createRuntimeAgent', {
  namedExports: {
    createRuntimeAgent: () => ({
      subscribeToIntent: (
        type: string,
        handler: (payload: unknown) => FutureInstance<Error, unknown>
      ) => {
        handlers.set(type, handler)
        return noop
      },
      raiseIntent: () => resolve(undefined),
    }),
  },
})

const event = { addListener: noop }
Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    runtime: { onInstalled: event, onStartup: event },
    action: { onClicked: event, setIcon: noop },
    tabs: { onActivated: event, onUpdated: event },
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./background')

function enqueuePayload(description: string | null) {
  return {
    projectId: 'project-1',
    title: 'Checkout is broken',
    description,
    url: 'https://example.com/checkout',
    mode: RecordingMode.Replay,
    duration: 1_000,
    events: [],
    browserName: 'Chrome',
    browserVersion: '120.0.0',
    operatingSystem: 'macOS',
  }
}

describe('capture background upload enqueue', () => {
  it('preserves report title and non-empty description', async () => {
    const handler = handlers.get('upload:enqueue')
    assert.ok(handler)

    await promise(handler(enqueuePayload('The checkout button does nothing.')))

    const upload = uploads[uploads.length - 1]
    assert.ok(upload)
    assert.equal(upload.title, 'Checkout is broken')
    assert.equal(upload.description, 'The checkout button does nothing.')
  })

  it('normalizes a null description to the API-required empty string', async () => {
    const handler = handlers.get('upload:enqueue')
    assert.ok(handler)

    await promise(handler(enqueuePayload(null)))

    const upload = uploads[uploads.length - 1]
    assert.ok(upload)
    assert.equal(upload.title, 'Checkout is broken')
    assert.equal(upload.description, '')
  })
})
