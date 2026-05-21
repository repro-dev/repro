import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, test } from 'node:test'

import SQLiteDatabase from 'better-sqlite3'
import { fork, type FutureInstance } from 'fluture'

import { createAutobotStore } from './client'
import type { AutobotStore } from './repositories'

const tempRoots: string[] = []

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    fork(reject)(resolve)(future)
  })
}

async function makeRepoRoot() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const tmpDir = path.join(repoRoot, 'tmp')
  await mkdir(tmpDir, { recursive: true })
  const tempDir = await mkdtemp(path.join(tmpDir, 'autobot-store-schema-'))
  tempRoots.push(tempDir)
  return tempDir
}

function dbPath(repoRoot: string) {
  return path.join(repoRoot, '.autobot', 'autobot.sqlite')
}

async function openStore(repoRoot: string): Promise<AutobotStore> {
  return runFuture<AutobotStore>(createAutobotStore({ repo: repoRoot }))
}

function openRawDb(repoRoot: string) {
  return new SQLiteDatabase(dbPath(repoRoot))
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('initializes sqlite state with durable worker migrations and indexes', async () => {
  const repoRoot = await makeRepoRoot()
  const store = await openStore(repoRoot)
  const db = openRawDb(repoRoot)

  const migrations = db
    .prepare('SELECT name FROM autobot_migrations ORDER BY name')
    .all() as Array<{ name: string }>
  assert.deepEqual(
    migrations.map(migration => migration.name),
    [
      '0001_initial_schema',
      '0002_transport_metadata',
      '0003_domain_event_run_lookup',
      '0004_durable_worker_records',
    ]
  )

  const workerColumns = db
    .prepare("PRAGMA table_info('workers')")
    .all() as Array<{ name: string }>
  assert.deepEqual(
    workerColumns.map(column => column.name),
    [
      'worker_id',
      'issue_id',
      'run_id',
      'flowcraft_execution_id',
      'workflow_node_id',
      'phase',
      'state',
      'pid',
      'process_group_id',
      'command',
      'args_json',
      'started_at',
      'last_heartbeat_at',
      'deadline_at',
      'stdout_log_path',
      'stderr_log_path',
      'result_json',
      'result_artifact_path',
      'exit_code',
      'signal',
      'finished_at',
    ]
  )

  const workerIndexes = db
    .prepare("PRAGMA index_list('workers')")
    .all() as Array<{ name: string }>
  assert.equal(
    workerIndexes.some(
      index => index.name === 'idx_workers_run_state_started_at'
    ),
    true
  )
  assert.equal(
    workerIndexes.some(
      index => index.name === 'idx_workers_issue_state_started_at'
    ),
    true
  )
  assert.equal(
    workerIndexes.some(
      index => index.name === 'idx_workers_flowcraft_execution_state_started_at'
    ),
    true
  )

  db.close()
  await runFuture(store.close())
})
