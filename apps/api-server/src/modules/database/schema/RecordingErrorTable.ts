import { ColumnType, GeneratedAlways, Insertable, Selectable } from 'kysely'

export interface RecordingErrorTable {
  id: GeneratedAlways<number>
  recordingId: number
  fingerprint: string
  message: string
  stackHash: string
  occurredAt: ColumnType<Date, Date, Date>
  createdAt: GeneratedAlways<Date>
}

export type RecordingErrorRow = Selectable<RecordingErrorTable>
export type NewRecordingErrorRow = Insertable<RecordingErrorTable>
