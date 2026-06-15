export interface RecordingCheckpoint {
  checkpointId: number
  startTime: number
  endTime: number
  eventCount: number
  byteLength: number
  pageURL: string
  events: Array<number>
  codecVersion: string
}

export interface CheckpointEntry {
  checkpointId: number
  startTime: number
  endTime: number
  eventCount: number
  byteLength: number
  pageURL: string
  filePath: string
}

export interface CheckpointManifest {
  sessionId: string
  entries: Array<CheckpointEntry>
  createdAt: number
  lastCheckpointId: number
}
