import { RecordingMode } from '@repro/domain'
import { ColumnType, GeneratedAlways } from 'kysely'

export interface RecordingTable {
  id: GeneratedAlways<number>
  title: string
  url: string
  description: string
  mode: RecordingMode
  duration: number
  createdAt: GeneratedAlways<Date>
  browserName: string | null
  browserVersion: string | null
  operatingSystem: string | null
  codecVersion: string
  dataUploadedAt: ColumnType<Date | null, Date | null | undefined, Date | null>
  eventIndexUploadedAt: ColumnType<
    Date | null,
    Date | null | undefined,
    Date | null
  >
  derivedProcessingReadyAt: ColumnType<
    Date | null,
    Date | null | undefined,
    Date | null
  >
  finalizedAt: ColumnType<Date | null, Date | null | undefined, Date | null>
}
