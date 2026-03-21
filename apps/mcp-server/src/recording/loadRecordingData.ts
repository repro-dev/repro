import { SourceEventView } from '@repro/domain'
import { List } from '@repro/tdl'
import { fromBinaryWireFormatStream } from '@repro/wire-formats'
import { attemptP, chain, FutureInstance } from 'fluture'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { StorageClient } from '~/modules/storage'

export function loadRecordingData(
  storage: StorageClient,
  recordingId: string
): FutureInstance<Error, List<typeof SourceEventView>> {
  return storage.read(`${recordingId}/data`).pipe(
    chain(readable => {
      return attemptP<Error, List<typeof SourceEventView>>(async () => {
        const webStream = Readable.toWeb(readable) as unknown as NodeReadableStream<ArrayBuffer>
        const decoded = fromBinaryWireFormatStream(webStream)
        const reader = decoded.getReader()
        const dataViews: DataView[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          dataViews.push(new DataView(value))
        }
        return new List(SourceEventView, dataViews)
      })
    })
  )
}
