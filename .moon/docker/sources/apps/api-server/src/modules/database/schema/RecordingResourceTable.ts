import { Generated } from 'kysely'

export interface RecordingResourceTable {
  id: Generated<number>
  recordingId: number
  key: string
  value: string
}
