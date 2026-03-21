import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { ApiKeyTable, RecordingTable } from './schema'

export interface McpSchema {
  api_keys: ApiKeyTable
  recordings: RecordingTable
}

export type Database = Kysely<McpSchema>

interface Config {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}

export function createPostgresDatabaseClient(config: Config): Database {
  return new Kysely<McpSchema>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl && {
          rejectUnauthorized: false,
        },
      }),
    }),
  })
}
