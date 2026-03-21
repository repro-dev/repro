import { GeneratedAlways } from 'kysely'
import { RecordingMode } from '@repro/domain'

export interface ApiKeyTable {
  id: GeneratedAlways<number>
  token: string
  name: string
  userId: number
  scopes: string[]
  lastUsedAt: Date | null
  createdAt: GeneratedAlways<Date>
  revokedAt: Date | null
}

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
