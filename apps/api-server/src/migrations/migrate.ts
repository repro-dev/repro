import { Migrator, sql } from 'kysely'
import { Database } from '~/modules/database'
import { SQLFileMigrationProvider } from './SQLFileMigrationProvider'

interface MigrateOptions {
  quiet?: boolean
}

// One-time rename map: old numeric-prefix tracking entries → new timestamp names.
// Applied before every migration run; safe to call on fresh databases (no-op when
// the old rows are absent or the table does not exist yet).
const LEGACY_NAME_MAP: Record<string, string> = {
  '000001-create-recording-table.sql':
    '20250422173432-create-recording-table.sql',
  '000002-create-resource-map-table.sql':
    '20250422173433-create-resource-map-table.sql',
  '000003-create-accounts-tables.sql':
    '20250422173434-create-accounts-tables.sql',
  '000004-create-feature-gates-tables.sql':
    '20251006214919-create-feature-gates-tables.sql',
  '000005-create-billing-tables.sql':
    '20260219175241-create-billing-tables.sql',
  '000006-add-user-lockout-columns.sql':
    '20260316204724-add-user-lockout-columns.sql',
  '000007-convert-integer-booleans-to-native.sql':
    '20260317073701-convert-integer-booleans-to-native.sql',
  '000008-create-recording-event-index-table.sql':
    '20260322212004-create-recording-event-index-table.sql',
  '000008-create-oauth-tables.sql': '20260323170354-create-oauth-tables.sql',
  '000009-hash-session-tokens.sql': '20260328080652-hash-session-tokens.sql',
  '000010-create-password-reset-tokens-table.sql':
    '20260329160810-create-password-reset-tokens-table.sql',
  '000011-create-oauth-connections-table.sql':
    '20260329173808-create-oauth-connections-table.sql',
  '000012-create-api-keys-table.sql':
    '20260329214636-create-api-keys-table.sql',
  '000013-create-agentic-feedback-table.sql':
    '20260331161837-create-agentic-feedback-table.sql',
}

/**
 * Rename legacy numeric-prefix tracking entries to their new timestamp names.
 * Idempotent: safe to call on databases already updated or never seeded with
 * old names. Swallows errors when the tracking table doesn't exist yet (fresh DB).
 */
async function renameLegacyTrackingEntries(db: Database): Promise<void> {
  try {
    for (const [oldName, newName] of Object.entries(LEGACY_NAME_MAP)) {
      await db.executeQuery(
        sql`UPDATE kysely_migration SET name = ${newName} WHERE name = ${oldName}`.compile(
          db
        )
      )
    }
  } catch {
    // Table does not exist yet (fresh database) — nothing to rename
  }
}

export async function migrate(db: Database, options: MigrateOptions = {}) {
  await renameLegacyTrackingEntries(db)

  const provider = new SQLFileMigrationProvider()
  const migrator = new Migrator({ db, provider })
  const result = await migrator.migrateToLatest()
  const quiet = options.quiet ?? false

  if (result.results && !quiet) {
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
