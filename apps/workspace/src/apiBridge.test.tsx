import { RecordingMode } from '@repro/domain'
import assert from 'node:assert/strict'
import { it, mock } from 'node:test'

// jsdom's postMessage uses positional args (msg, targetOrigin, transfer?)
// but the real browser API uses (msg, options) form. The messaging agent
// uses modern postMessage, which jsdom rejects. Shim it before module load.
if (typeof globalThis.window !== 'undefined') {
  const originalPM = globalThis.window.postMessage.bind(globalThis.window)
  globalThis.window.postMessage = function shimmedPostMessage(
    message: unknown,
    options: { targetOrigin?: string; transfer?: Transferable[] } | string
  ) {
    const targetOrigin =
      typeof options === 'string' ? options : options?.targetOrigin ?? '*'
    const transfer = typeof options === 'object' ? options?.transfer ?? [] : []
    return originalPM(message, targetOrigin, transfer)
  } as typeof globalThis.window.postMessage
}

const VALID_ENQUEUE_PAYLOAD = {
  projectId: 'project-1',
  title: 'Test',
  description: 'Test description',
  url: 'https://example.com',
  mode: RecordingMode.Live,
  duration: 5000,
  events: [],
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: 'macOS',
}

it('should register all intent handlers, create upload worker, and return Futures from upload handlers', async () => {
  const subscribeToIntent = mock.fn(() => () => {})
  const mockCreateUploadWorker = mock.fn(() => ({
    enqueue: mock.fn(() => 'ref-123'),
    getProgress: mock.fn(() => null),
  }))

  mock.module('@repro/messaging', {
    namedExports: {
      createMessagingAgent: () => ({
        name: 'apiBridge',
        subscribeToIntent,
        raiseIntent: mock.fn(),
        destroy: mock.fn(),
      }),
    },
  })

  mock.module('@repro/recording-api', {
    namedExports: {
      createUploadWorker: mockCreateUploadWorker,
    },
  })

  await import('./apiBridge')

  // 1. Verify all handlers registered
  const registeredTypes: string[] = subscribeToIntent.mock.calls
    .filter(c => c.arguments.length > 0)
    .map(c => String((c.arguments as unknown as Array<unknown>)[0]))

  assert.ok(
    registeredTypes.includes('api-client:fetch'),
    'should register api-client:fetch'
  )
  assert.ok(
    registeredTypes.includes('api-client:abort'),
    'should register api-client:abort'
  )
  assert.ok(
    registeredTypes.includes('analytics:track'),
    'should register analytics:track'
  )
  assert.ok(
    registeredTypes.includes('upload:enqueue'),
    'should register upload:enqueue'
  )
  assert.ok(
    registeredTypes.includes('upload:progress'),
    'should register upload:progress'
  )

  // 2. Verify upload worker created once with correct options
  assert.equal(
    mockCreateUploadWorker.mock.calls.length,
    1,
    'createUploadWorker should be called once at module init'
  )

  const createWorkerArgs = mockCreateUploadWorker.mock.calls[0]!.arguments
  assert.ok(
    createWorkerArgs.length >= 2,
    'createUploadWorker should receive at least 2 arguments'
  )
  const options = (createWorkerArgs as unknown as Array<unknown>)[1] as
    | Record<string, unknown>
    | undefined
  assert.equal(options?.withEncryptionScheme, 'none')

  // Helper: safely access mock call arguments as unknown array
  function getCallArgs(
    call: (typeof subscribeToIntent.mock.calls)[number]
  ): unknown[] {
    return call.arguments as unknown as unknown[]
  }

  // 3. Verify upload:enqueue handler returns a Future
  const enqueueCall = subscribeToIntent.mock.calls.find(c => {
    const args = getCallArgs(c)
    return args.length > 0 && args[0] === 'upload:enqueue'
  })
  assert.ok(enqueueCall, 'upload:enqueue handler should be registered')

  const enqueueArgs = getCallArgs(enqueueCall)
  assert.ok(
    enqueueArgs.length >= 2,
    'upload:enqueue should have a resolver as second arg'
  )

  const enqueueHandler = enqueueArgs[1] as
    | ((payload: unknown) => unknown)
    | undefined
  assert.ok(enqueueHandler, 'upload:enqueue resolver should exist')

  const enqueueResult = enqueueHandler(VALID_ENQUEUE_PAYLOAD)
  assert.ok(enqueueResult, 'upload:enqueue handler should return a value')
  assert.equal(
    typeof (enqueueResult as Record<string, unknown>).pipe,
    'function',
    'upload:enqueue result should be a FutureInstance with .pipe() method'
  )

  // 4. Verify upload:progress handler returns a Future
  const progressCall = subscribeToIntent.mock.calls.find(c => {
    const args = getCallArgs(c)
    return args.length > 0 && args[0] === 'upload:progress'
  })
  assert.ok(progressCall, 'upload:progress handler should be registered')

  const progressArgs = getCallArgs(progressCall)
  assert.ok(
    progressArgs.length >= 2,
    'upload:progress should have a resolver as second arg'
  )

  const progressHandler = progressArgs[1] as
    | ((payload: unknown) => unknown)
    | undefined
  assert.ok(progressHandler, 'upload:progress resolver should exist')

  const progressResult = progressHandler({ ref: 'ref-abc' })
  assert.ok(progressResult, 'upload:progress handler should return a value')
  assert.equal(
    typeof (progressResult as Record<string, unknown>).pipe,
    'function',
    'upload:progress result should be a FutureInstance with .pipe() method'
  )
})
