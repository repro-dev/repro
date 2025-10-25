import {
  InteractionType,
  RecordingInfo,
  RecordingMode,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { go } from 'fluture'
import { Readable } from 'node:stream'
import { encodeId } from '~/modules/database'
import { createRecordingDataWireFormat } from '../recording'
import { Fixture } from '../types'
import { readableToString, stringToReadable } from '../utils'

export const RecordingA: Fixture<RecordingInfo> = {
  dependencies: [],
  load: ({ recordingService }) =>
    recordingService.writeInfo(
      'Recording A',
      'https://example.com/recording-a',
      'Description for Recording A',
      RecordingMode.Replay,
      10_000,
      'Chrome',
      '120.0.0',
      'Linux x86_64'
    ),
}

export const RecordingB: Fixture<RecordingInfo> = {
  dependencies: [],
  load: ({ recordingService }) =>
    recordingService.writeInfo(
      'Recording B',
      'https://example.com/recording-b',
      'Description for Recording B',
      RecordingMode.Snapshot,
      30_000,
      'Firefox',
      '124.0.0',
      'macOS'
    ),
}

export const RecordingA_Data: Fixture<string> = {
  dependencies: [RecordingA],
  load: ({ recordingService }, recording: RecordingInfo) => {
    return go<Error, string>(function* () {
      const events: Array<SourceEvent> = [
        new Box({
          type: SourceEventType.Interaction,
          time: 0,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [100, 100],
            to: [200, 200],
            duration: 25,
          }),
        }),
      ]

      const input: Readable = yield stringToReadable(
        createRecordingDataWireFormat(events)
      )

      yield recordingService.writeDataFromStream(recording.id, input)

      const output: Readable = yield recordingService.readDataAsStream(
        recording.id
      )

      return yield readableToString(output)
    })
  },
}

export const RecordingA_ResourceA: Fixture<[string, string]> = {
  dependencies: [RecordingA],
  load: ({ recordingService }, recording: RecordingInfo) => {
    return go(function* () {
      const resource = 'data:text/plain,Resource A'
      const resourceId = 'resource-a'

      const input: Readable = yield stringToReadable(resource)

      yield recordingService.writeResourceFromStream(
        recording.id,
        resourceId,
        input
      )

      const output: Readable = yield recordingService.readResourceAsStream(
        recording.id,
        resourceId
      )

      return [resourceId, yield readableToString(output)]
    })
  },
}

export const RecordingA_WithResourceMap: Fixture<
  [RecordingInfo, Record<string, string>]
> = {
  dependencies: [RecordingA],
  load: ({ recordingService }, recording: RecordingInfo) => {
    return go(function* () {
      const resourceMap = {
        [encodeId(123)]: 'https://example.com/foo.png',
        [encodeId(456)]: 'https://example.com/bar.png',
      }

      yield recordingService.writeResourceMap(recording.id, resourceMap)

      return [recording, yield recordingService.readResourceMap(recording.id)]
    })
  },
}
