import { ColumnType, GeneratedAlways, Insertable, Selectable } from 'kysely'

export type OutboxJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type OutboxJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: OutboxJson }
  | Array<OutboxJson>

export interface OutboxLastError {
  name?: string
  message: string
  stack?: string
}

export interface OutboxJobTable {
  id: GeneratedAlways<number>
  type: string
  payload: ColumnType<OutboxJson, OutboxJson, OutboxJson>
  status: ColumnType<
    OutboxJobStatus,
    OutboxJobStatus | undefined,
    OutboxJobStatus
  >
  attempts: ColumnType<number, number | undefined, number>
  maxAttempts: ColumnType<number, number | undefined, number>
  runAfter: ColumnType<Date, Date | undefined, Date>
  lockedAt: ColumnType<Date | null, Date | null | undefined, Date | null>
  lockedBy: ColumnType<string | null, string | null | undefined, string | null>
  lastError: ColumnType<
    OutboxLastError | null,
    OutboxLastError | null | undefined,
    OutboxLastError | null
  >
  idempotencyKey: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >
  createdAt: GeneratedAlways<Date>
  updatedAt: GeneratedAlways<Date>
}

export type OutboxJobRow = Selectable<OutboxJobTable>
export type NewOutboxJobRow = Insertable<OutboxJobTable>
