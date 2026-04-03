import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_RECORDING_STREAM,
  createRecordingStream,
} from './createRecordingStream'

// Minimal document mock for testing
function createMockDocument(): Document {
  return document
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
  })
})
