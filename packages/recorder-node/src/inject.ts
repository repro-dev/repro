import { createRecordingStream, RecordingStream } from '@repro/recording'
import { toByteString } from '@repro/wire-formats'

interface RecorderInject {
  start(): void
  stop(): void
  getEvents(): string[]
}

declare global {
  interface Window {
    __REPRO_RECORDER__: RecorderInject
  }
}

let stream: RecordingStream | null = null

window.__REPRO_RECORDER__ = {
  start() {
    if (stream?.isStarted()) {
      return
    }

    stream = createRecordingStream(document, {
      types: new Set([
        'dom',
        'interaction',
        'network',
        'console',
        'performance',
        'state',
      ]),
      ignoredNodes: [],
      ignoredSelectors: [],
    })

    stream.start()
  },

  stop() {
    stream?.stop()
  },

  getEvents(): string[] {
    if (!stream) {
      return []
    }

    const events = stream.slice()
    const source = events.toSource()

    return source.map(view => {
      const bytes = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength
      )
      return toByteString(bytes)
    })
  },
}
