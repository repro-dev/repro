import SQLiteDatabase, { Database as DatabaseT } from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { defaultSystemConfig } from '~/config/system'
import { Schema } from './schema'
import { Database } from './types'

interface Config {
  path: string
}

export function createSQLiteDatabaseClient(
  configOrInstance: Config | DatabaseT,
  systemConfig = defaultSystemConfig
): Database {
  const database =
    configOrInstance instanceof SQLiteDatabase
      ? configOrInstance
      : new SQLiteDatabase(configOrInstance.path, {
          verbose: systemConfig.debug ? console.debug : undefined,
        })

  database.pragma('journal_mode=WAL')

  return new Kysely<Schema>({
    dialect: new SqliteDialect({ database }),
  })
}
