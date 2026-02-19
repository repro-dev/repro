import { Migrator } from 'kysely'
import { Database } from '~/modules/database'
import { SQLFileMigrationProvider } from './SQLFileMigrationProvider'

export async function migrate(db: Database) {
  const provider = new SQLFileMigrationProvider()
  const migrator = new Migrator({ db, provider })
  const result = await migrator.migrateToLatest()

  if (result.results) {
    for (const migration of result.results) {
      const tag =
        migration.status === 'Success'
          ? 'applied'
          : migration.status === 'NotExecuted'
            ? 'skipped'
            : 'error'
      console.log(`Migration ${migration.migrationName}: ${tag}`)
    }

    if (result.results.length === 0) {
      console.log('Migrations: all up to date')
    }
  }

  if (result.error) {
    console.error('Migration failed:', result.error)
  }

  return result
}
