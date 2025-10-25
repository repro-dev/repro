import { RecordingMode } from '@repro/domain'
import { GeneratedAlways } from 'kysely'

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
}
