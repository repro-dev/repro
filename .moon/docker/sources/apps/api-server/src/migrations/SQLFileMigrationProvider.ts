import { Migration, MigrationProvider, sql } from 'kysely'
import { findMigrationFilenames, readMigrationFile } from 'migration-files'
import path from 'node:path'

export class SQLFileMigrationProvider implements MigrationProvider {
  async getMigrations() {
    const filenames = await findMigrationFilenames(
      path.resolve(__dirname, 'data')
    )

    const migrationEntries = await Promise.all(filenames.map(readMigrationFile))
    const migrations: Record<string, Migration> = {}

    for (const entry of migrationEntries) {
      migrations[entry.filename] = {
        async up(db) {
          await db.executeQuery(sql.raw(entry.up).compile(db))
        },

        async down(db) {
          await db.executeQuery(sql.raw(entry.down).compile(db))
        },
      }
    }

    return migrations
  }
}
