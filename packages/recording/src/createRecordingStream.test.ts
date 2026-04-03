import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  EMPTY_RECORDING_STREAM,
  createRecordingStream,
} from './createRecordingStream'

// jsdom does not implement requestIdleCallback. Polyfill with a synchronous
// shim so tests that call start() (which pushes to the event buffer) don't
// blow up at the scheduling boundary.
if (typeof globalThis.requestIdleCallback === 'undefined') {
  ;(globalThis as Record<string, unknown>)['requestIdleCallback'] = (
    cb: IdleRequestCallback
  ) => {
    cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline)
    return 0
  }
  ;(globalThis as Record<string, unknown>)['cancelIdleCallback'] = () => {}
}

// Minimal document mock for testing
function createMockDocument(): Document {
  return document
}

// Install a minimal React DevTools hook so detectFrameworks() sees React.
// Returns a cleanup function that removes the hook.
function installReactHook(): () => void {
  const originalFn = () => {}
  ;(globalThis as Record<string, unknown>)['__REACT_DEVTOOLS_GLOBAL_HOOK__'] = {
    onCommitFiberRoot: originalFn,
    isDisabled: false,
    inject: () => {},
    _renderers: {},
    helpers: {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    // Store a reference so tests can verify the original handler
    _originalFn: originalFn,
  }
  return () => {
    delete (globalThis as Record<string, unknown>)[
      '__REACT_DEVTOOLS_GLOBAL_HOOK__'
    ]
  }
}

describe('EMPTY_RECORDING_STREAM', () => {
  it('implements enableFrameworkStateRecording as a no-op', () => {
    assert.doesNotThrow(() => {
      EMPTY_RECORDING_STREAM.enableFrameworkStateRecording()
    })
  })
})

describe('createRecordingStream', () => {
  describe('enableFrameworkStateRecording', () => {
    it('is defined on the returned stream object', () => {
      const stream = createRecordingStream(createMockDocument(), {
        types: new Set(['dom']),
      })

      assert.equal(typeof stream.enableFrameworkStateRecording, 'function')
      stream.stop()
    })

    it('is idempotent: calling twice does not throw', () => {
      const stream = createRecordingStream(createMockDocument(), {
        types: new Set(['dom']),
      })

      assert.doesNotThrow(() => {
        stream.enableFrameworkStateRecording()
        stream.enableFrameworkStateRecording()
      })

      stream.stop()
    })

    it('can be called before the stream is started', () => {
      const stream = createRecordingStream(createMockDocument(), {
        types: new Set(['dom']),
      })

      // Should not throw when called before start()
      assert.doesNotThrow(() => {
        stream.enableFrameworkStateRecording()
      })

      stream.stop()
    })

    it('can be called after the stream is started (without browser APIs)', () => {
      const stream = createRecordingStream(createMockDocument(), {
        // Use an empty types set to avoid initializing observers that need browser APIs
        types: new Set([]),
      })

      // Should not throw when called without start()
      assert.doesNotThrow(() => {
        stream.enableFrameworkStateRecording()
      })

      stream.stop()
    })

    describe('with React detected', () => {
      let cleanupHook: () => void

      beforeEach(() => {
        cleanupHook = installReactHook()
      })

      afterEach(() => {
        cleanupHook()
      })

      it('idempotency: calling twice installs the React hook only once', () => {
        // The stream is created after the hook is installed so detectFrameworks
        // returns { react: true }. Include 'dom' so start() can build the VTree.
        const stream = createRecordingStream(createMockDocument(), {
          types: new Set(['dom']),
        })

        const hook = (globalThis as Record<string, unknown>)[
          '__REACT_DEVTOOLS_GLOBAL_HOOK__'
        ] as Record<string, unknown>

        // First call registers the observer; the hook is wrapped on start().
        stream.enableFrameworkStateRecording()
        stream.start()
        const wrappedAfterFirst = hook['onCommitFiberRoot']
        assert.notEqual(
          wrappedAfterFirst,
          hook['_originalFn'],
          'onCommitFiberRoot should be wrapped after start()'
        )

        // Second call must be a no-op — the handler reference must not change.
        stream.enableFrameworkStateRecording()
        const wrappedAfterSecond = hook['onCommitFiberRoot']
        assert.equal(
          wrappedAfterSecond,
          wrappedAfterFirst,
          'second call must not re-wrap onCommitFiberRoot'
        )

        stream.stop()
      })

      it('calling before start(): React hook is installed when start() is called', () => {
        // Include 'dom' so start() can build the VTree.
        const stream = createRecordingStream(createMockDocument(), {
          types: new Set(['dom']),
        })

        const hook = (globalThis as Record<string, unknown>)[
          '__REACT_DEVTOOLS_GLOBAL_HOOK__'
        ] as Record<string, unknown>
        const originalHandler = hook['onCommitFiberRoot']

        // Call before start — the state observer is registered but not yet started.
        stream.enableFrameworkStateRecording()

        // Hook should not yet be wrapped (start() hasn't been called)
        assert.equal(
          hook['onCommitFiberRoot'],
          originalHandler,
          'React hook should not be wrapped before start() is called'
        )

        // Now start() — the observer should be observed, wrapping the hook.
        stream.start()
        assert.notEqual(
          hook['onCommitFiberRoot'],
          originalHandler,
          'React hook should be wrapped after start() is called'
        )

        stream.stop()
      })
    })
  })
})
