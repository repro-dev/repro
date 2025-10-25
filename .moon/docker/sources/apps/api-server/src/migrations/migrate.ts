import { Migrator } from 'kysely'
import { Database } from '~/modules/database'
import { SQLFileMigrationProvider } from './SQLFileMigrationProvider'

export function migrate(db: Database) {
  const provider = new SQLFileMigrationProvider()
  const migrator = new Migrator({ db, provider })
  return migrator.migrateToLatest()
}
