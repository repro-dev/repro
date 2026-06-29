import { RecordingMode } from '@repro/domain'

export function getModeLabel(mode: RecordingMode): string {
  switch (mode) {
    case RecordingMode.Live:
      return 'Live'
    case RecordingMode.Replay:
      return 'Replay'
    case RecordingMode.Snapshot:
      return 'Snapshot'
    case RecordingMode.None:
      return 'Inactive'
  }
}

export function getModeContext(mode: RecordingMode): 'info' | 'neutral' {
  switch (mode) {
    case RecordingMode.Live:
    case RecordingMode.Replay:
      return 'info'
    case RecordingMode.Snapshot:
    case RecordingMode.None:
      return 'neutral'
  }
}
