import { RecordingMode, SourceEvent } from '@repro/domain'

export interface UploadInput {
  title: string
  description: string
  url: string
  mode: RecordingMode
  duration: number
  events: Array<SourceEvent>
  browserName: string | null
  browserVersion: string | null
  operatingSystem: string | null
}

export enum UploadStage {
  Enqueued,
  CreateRecording,
  SaveEvents,
  ReadResources,
  SaveResources,
}

export interface UploadProgress {
  ref: string
  recordingId: string | null
  encryptionKey: string | null
  stages: Record<UploadStage, number>
  completed: boolean
  error: Error | null
}
