import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import type { AutobotSchema } from './schema'

export const autobotMigrationNames = [
  '0001_initial_schema',
  '0002_transport_metadata',
  '0003_domain_event_run_lookup',
] as const

type MigrationName = (typeof autobotMigrationNames)[number]

interface Migration {
  name: MigrationName
  up(db: Kysely<AutobotSchema>): Promise<void>
}

async function createBaseTables(db: Kysely<AutobotSchema>) {
  await db.schema
    .createTable('autobot_migrations')
    .ifNotExists()
    .addColumn('name', 'text', column => column.primaryKey())
    .addColumn('applied_at', 'text', column => column.notNull())
    .execute()

  await db.schema
    .createTable('items')
    .ifNotExists()
    .addColumn('issue_id', 'text', column => column.primaryKey())
    .addColumn('title', 'text')
    .addColumn('url', 'text')
    .addColumn('state', 'text', column => column.notNull())
    .addColumn('attempt', 'integer', column => column.notNull())
    .addColumn('priority', 'integer')
    .addColumn('owner', 'text')
    .addColumn('workspace', 'text')
    .addColumn('branch', 'text')
    .addColumn('queued_at', 'text')
    .addColumn('started_at', 'text')
    .addColumn('updated_at', 'text', column => column.notNull())
    .addColumn('last_event', 'text')
    .addColumn('last_error_json', 'text')
    .addColumn('recovery_commands_json', 'text', column =>
      column.notNull().defaultTo('[]')
    )
    .addColumn('cancellation_requested', 'integer', column =>
      column.notNull().defaultTo(0)
    )
    .addColumn('cancellation_requested_at', 'text')
    .addColumn('state_name', 'text')
    .addColumn('state_type', 'text')
    .addColumn('project', 'text')
    .addColumn('labels_json', 'text', column =>
      column.notNull().defaultTo('[]')
    )
    .addColumn('assignee', 'text')
    .addColumn('current_run_id', 'text')
    .execute()

  await db.schema
    .createIndex('idx_items_state_updated_at')
    .ifNotExists()
    .on('items')
    .columns(['state', 'updated_at'])
    .execute()

  await db.schema
    .createTable('runs')
    .ifNotExists()
    .addColumn('run_id', 'text', column => column.primaryKey())
    .addColumn('issue_id', 'text', column => column.notNull())
    .addColumn('attempt', 'integer', column => column.notNull())
    .addColumn('state', 'text', column => column.notNull())
    .addColumn('flowcraft_execution_id', 'text')
    .addColumn('blueprint_id', 'text', column => column.notNull())
    .addColumn('blueprint_version', 'text', column => column.notNull())
    .addColumn('started_at', 'text', column => column.notNull())
    .addColumn('finished_at', 'text')
    .addColumn('worker_id', 'text')
    .addColumn('last_heartbeat_at', 'text')
    .addColumn('transport_json', 'text')
    .execute()

  await db.schema
    .createIndex('idx_runs_issue_attempt')
    .ifNotExists()
    .on('runs')
    .columns(['issue_id', 'attempt'])
    .execute()

  await db.schema
    .createTable('workers')
    .ifNotExists()
    .addColumn('worker_id', 'text', column => column.primaryKey())
    .addColumn('issue_id', 'text')
    .addColumn('run_id', 'text')
    .addColumn('state', 'text', column => column.notNull())
    .addColumn('pid', 'integer')
    .addColumn('started_at', 'text', column => column.notNull())
    .addColumn('last_heartbeat_at', 'text')
    .execute()

  await db.schema
    .createIndex('idx_workers_state')
    .ifNotExists()
    .on('workers')
    .columns(['state'])
    .execute()

  await db.schema
    .createTable('config_overrides')
    .ifNotExists()
    .addColumn('key', 'text', column => column.primaryKey())
    .addColumn('value', 'text', column => column.notNull())
    .addColumn('value_type', 'text', column => column.notNull())
    .addColumn('source', 'text', column => column.notNull())
    .addColumn('updated_at', 'text', column => column.notNull())
    .execute()

  await db.schema
    .createTable('artifacts')
    .ifNotExists()
    .addColumn('artifact_id', 'integer', column =>
      column.primaryKey().autoIncrement()
    )
    .addColumn('issue_id', 'text', column => column.notNull())
    .addColumn('run_id', 'text')
    .addColumn('attempt', 'integer', column => column.notNull())
    .addColumn('kind', 'text', column => column.notNull())
    .addColumn('path', 'text', column => column.notNull())
    .addColumn('description', 'text')
    .addColumn('content_hash', 'text')
    .addColumn('supersedes_artifact_id', 'integer')
    .addColumn('inherited_from_artifact_id', 'integer')
    .addColumn('created_at', 'text', column => column.notNull())
    .execute()

  await db.schema
    .createIndex('idx_artifacts_issue_created_at')
    .ifNotExists()
    .on('artifacts')
    .columns(['issue_id', 'created_at'])
    .execute()

  await db.schema
    .createTable('domain_events')
    .ifNotExists()
    .addColumn('event_id', 'text', column => column.primaryKey())
    .addColumn('issue_id', 'text')
    .addColumn('run_id', 'text')
    .addColumn('type', 'text', column => column.notNull())
    .addColumn('state', 'text')
    .addColumn('message', 'text', column => column.notNull())
    .addColumn('severity', 'text', column => column.notNull())
    .addColumn('occurred_at', 'text', column => column.notNull())
    .addColumn('actor', 'text', column => column.notNull())
    .addColumn('transport_json', 'text')
    .addColumn('data_json', 'text', column => column.notNull())
    .execute()

  await db.schema
    .createIndex('idx_domain_events_issue_occurred_at_event_id')
    .ifNotExists()
    .on('domain_events')
    .columns(['issue_id', 'occurred_at', 'event_id'])
    .execute()

  await db.schema
    .createIndex('idx_domain_events_occurred_at_event_id')
    .ifNotExists()
    .on('domain_events')
    .columns(['occurred_at', 'event_id'])
    .execute()

  await db.schema
    .createTable('flowcraft_executions')
    .ifNotExists()
    .addColumn('execution_id', 'text', column => column.primaryKey())
    .addColumn('issue_id', 'text', column => column.notNull())
    .addColumn('run_id', 'text')
    .addColumn('state', 'text', column => column.notNull())
    .addColumn('started_at', 'text', column => column.notNull())
    .addColumn('finished_at', 'text')
    .addColumn('metadata_json', 'text', column => column.notNull())
    .execute()

  await db.schema
    .createIndex('idx_flowcraft_executions_issue_started_at')
    .ifNotExists()
    .on('flowcraft_executions')
    .columns(['issue_id', 'started_at'])
    .execute()

  await db.schema
    .createTable('flowcraft_events')
    .ifNotExists()
    .addColumn('flowcraft_event_id', 'text', column => column.primaryKey())
    .addColumn('execution_id', 'text', column => column.notNull())
    .addColumn('node_id', 'text', column => column.notNull())
    .addColumn('type', 'text', column => column.notNull())
    .addColumn('occurred_at', 'text', column => column.notNull())
    .addColumn('data_json', 'text', column => column.notNull())
    .execute()

  await db.schema
    .createIndex('idx_flowcraft_events_execution_occurred_at')
    .ifNotExists()
    .on('flowcraft_events')
    .columns(['execution_id', 'occurred_at'])
    .execute()
}

async function addTransportMetadataColumns(db: Kysely<AutobotSchema>) {
  try {
    await sql`ALTER TABLE runs ADD COLUMN transport_json text`.execute(db)
  } catch (error) {
    if (!String(error).includes('duplicate column name')) {
      throw error
    }
  }

  try {
    await sql`ALTER TABLE domain_events ADD COLUMN transport_json text`.execute(
      db
    )
  } catch (error) {
    if (!String(error).includes('duplicate column name')) {
      throw error
    }
  }
}

async function addDomainEventRunLookupIndex(db: Kysely<AutobotSchema>) {
  await db.schema
    .createIndex('idx_domain_events_run_occurred_at_event_id')
    .ifNotExists()
    .on('domain_events')
    .columns(['run_id', 'occurred_at', 'event_id'])
    .execute()
}

async function createAppendOnlyTriggers(db: Kysely<AutobotSchema>) {
  await sql`
    CREATE TRIGGER IF NOT EXISTS domain_events_no_update
    BEFORE UPDATE ON domain_events
    BEGIN
      SELECT RAISE(ABORT, 'domain_events is append-only');
    END;
  `.execute(db)

  await sql`
    CREATE TRIGGER IF NOT EXISTS domain_events_no_delete
    BEFORE DELETE ON domain_events
    BEGIN
      SELECT RAISE(ABORT, 'domain_events is append-only');
    END;
  `.execute(db)
}

const migrations: readonly Migration[] = [
  { name: '0001_initial_schema', up: createBaseTables },
  { name: '0002_transport_metadata', up: addTransportMetadataColumns },
  { name: '0003_domain_event_run_lookup', up: addDomainEventRunLookupIndex },
]

async function ensureMigrationsTable(db: Kysely<AutobotSchema>) {
  await db.schema
    .createTable('autobot_migrations')
    .ifNotExists()
    .addColumn('name', 'text', column => column.primaryKey())
    .addColumn('applied_at', 'text', column => column.notNull())
    .execute()
}

async function listAppliedMigrations(db: Kysely<AutobotSchema>) {
  const rows = await db
    .selectFrom('autobot_migrations')
    .select('name')
    .execute()
  return new Set(rows.map(row => row.name as MigrationName))
}

async function recordMigration(db: Kysely<AutobotSchema>, name: MigrationName) {
  await db
    .insertInto('autobot_migrations')
    .values({
      name,
      applied_at: new Date().toISOString(),
    })
    .onConflict(conflict => conflict.column('name').doNothing())
    .execute()
}

export async function migrateAutobotStore(db: Kysely<AutobotSchema>) {
  await ensureMigrationsTable(db)
  const applied = await listAppliedMigrations(db)

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue
    }

    await migration.up(db)
    await recordMigration(db, migration.name)
    applied.add(migration.name)
  }

  await createAppendOnlyTriggers(db)
}
