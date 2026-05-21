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
  const tempDir = await mkdtemp(path.join(tmpDir, 'autobot-store-legacy-'))
  tempRoots.push(tempDir)
  return tempDir
}

function dbPath(repoRoot: string) {
  return path.join(repoRoot, '.autobot', 'autobot.sqlite')
}

function openRawDb(repoRoot: string) {
  return new SQLiteDatabase(dbPath(repoRoot))
}

async function openStore(repoRoot: string): Promise<AutobotStore> {
  return runFuture<AutobotStore>(createAutobotStore({ repo: repoRoot }))
}

async function createLegacyPre0005Store(repoRoot: string) {
  await mkdir(path.join(repoRoot, '.autobot'), { recursive: true })
  const db = openRawDb(repoRoot)

  db.exec(`
    CREATE TABLE autobot_migrations (
      name text primary key,
      applied_at text not null
    );

    CREATE TABLE runs (
      run_id text primary key,
      issue_id text not null,
      attempt integer not null,
      state text not null,
      flowcraft_execution_id text,
      blueprint_id text not null,
      blueprint_version text not null,
      started_at text not null,
      finished_at text,
      worker_id text,
      last_heartbeat_at text,
      transport_json text
    );

    CREATE TABLE workers (
      worker_id text primary key,
      issue_id text,
      run_id text,
      flowcraft_execution_id text,
      workflow_node_id text,
      phase text,
      state text not null,
      pid integer,
      process_group_id integer,
      command text,
      args_json text not null default '[]',
      started_at text not null,
      last_heartbeat_at text,
      deadline_at text,
      stdout_log_path text,
      stderr_log_path text,
      result_json text,
      result_artifact_path text,
      exit_code integer,
      signal text,
      finished_at text
    );

    CREATE TABLE domain_events (
      event_id text primary key,
      issue_id text,
      run_id text,
      type text not null,
      state text,
      message text not null,
      severity text not null,
      occurred_at text not null,
      actor text not null,
      transport_json text,
      data_json text not null
    );

    CREATE INDEX idx_domain_events_run_occurred_at_event_id
    ON domain_events (run_id, occurred_at, event_id);

    CREATE INDEX idx_workers_state ON workers (state);
    CREATE INDEX idx_workers_run_state_started_at
    ON workers (run_id, state, started_at);
    CREATE INDEX idx_workers_issue_state_started_at
    ON workers (issue_id, state, started_at);
    CREATE INDEX idx_workers_flowcraft_execution_state_started_at
    ON workers (flowcraft_execution_id, state, started_at);
  `)

  const appliedAt = '2026-05-21T14:00:00Z'
  for (const name of [
    '0001_initial_schema',
    '0002_transport_metadata',
    '0003_domain_event_run_lookup',
    '0004_durable_worker_records',
  ]) {
    db.prepare(
      'INSERT INTO autobot_migrations (name, applied_at) VALUES (?, ?)'
    ).run(name, appliedAt)
  }

  db.prepare(
    'INSERT INTO runs (run_id, issue_id, attempt, state, flowcraft_execution_id, blueprint_id, blueprint_version, started_at, finished_at, worker_id, last_heartbeat_at, transport_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'run-legacy-cancel',
    'REP-1221',
    1,
    'claimed',
    null,
    'autobot-deliver-issue',
    '1.0.0',
    '2026-05-21T13:00:00Z',
    null,
    'worker-legacy-cancel',
    '2026-05-21T13:05:00Z',
    null
  )

  db.prepare(
    'INSERT INTO runs (run_id, issue_id, attempt, state, flowcraft_execution_id, blueprint_id, blueprint_version, started_at, finished_at, worker_id, last_heartbeat_at, transport_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'run-legacy-exited',
    'REP-1221',
    2,
    'completed',
    null,
    'autobot-deliver-issue',
    '1.0.0',
    '2026-05-21T12:00:00Z',
    '2026-05-21T12:10:00Z',
    'worker-legacy-exited',
    '2026-05-21T12:05:00Z',
    null
  )

  db.prepare(
    'INSERT INTO workers (worker_id, issue_id, run_id, flowcraft_execution_id, workflow_node_id, phase, state, pid, process_group_id, command, args_json, started_at, last_heartbeat_at, deadline_at, stdout_log_path, stderr_log_path, result_json, result_artifact_path, exit_code, signal, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'worker-legacy-cancel',
    'REP-1221',
    'run-legacy-cancel',
    null,
    'planning',
    'planning',
    'cancellation-requested',
    4242,
    4242,
    'opencode',
    JSON.stringify(['run-worker', '--issue', 'REP-1221']),
    '2026-05-21T13:00:00Z',
    '2026-05-21T13:05:00Z',
    null,
    '.autobot/workers/worker-legacy-cancel.stdout.log',
    '.autobot/workers/worker-legacy-cancel.stderr.log',
    null,
    null,
    null,
    null,
    null
  )

  db.prepare(
    'INSERT INTO workers (worker_id, issue_id, run_id, flowcraft_execution_id, workflow_node_id, phase, state, pid, process_group_id, command, args_json, started_at, last_heartbeat_at, deadline_at, stdout_log_path, stderr_log_path, result_json, result_artifact_path, exit_code, signal, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'worker-legacy-exited',
    'REP-1221',
    'run-legacy-exited',
    null,
    'testing',
    'testing',
    'exited',
    4243,
    4243,
    'opencode',
    JSON.stringify(['run-worker', '--issue', 'REP-1221']),
    '2026-05-21T12:00:00Z',
    '2026-05-21T12:05:00Z',
    null,
    '.autobot/workers/worker-legacy-exited.stdout.log',
    '.autobot/workers/worker-legacy-exited.stderr.log',
    null,
    null,
    0,
    null,
    '2026-05-21T12:10:00Z'
  )

  db.close()
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('migrates pre-0005 worker rows and durable worker indexes', async () => {
  const repoRoot = await makeRepoRoot()
  await createLegacyPre0005Store(repoRoot)

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
      '0005_worker_child_pid',
    ]
  )

  const workerColumns = db
    .prepare("PRAGMA table_info('workers')")
    .all() as Array<{ name: string }>
  const workerColumnNames = workerColumns.map(column => column.name)

  for (const columnName of [
    'flowcraft_execution_id',
    'workflow_node_id',
    'phase',
    'child_pid',
    'process_group_id',
    'command',
    'args_json',
    'deadline_at',
    'stdout_log_path',
    'stderr_log_path',
    'result_json',
    'result_artifact_path',
    'exit_code',
    'signal',
    'finished_at',
  ]) {
    assert.equal(workerColumnNames.includes(columnName), true)
  }

  const workerIndexes = db
    .prepare("PRAGMA index_list('workers')")
    .all() as Array<{ name: string }>
  for (const indexName of [
    'idx_workers_run_state_started_at',
    'idx_workers_issue_state_started_at',
    'idx_workers_flowcraft_execution_state_started_at',
  ]) {
    assert.equal(
      workerIndexes.some(index => index.name === indexName),
      true
    )
  }

  const workers = await runFuture(store.workers.list({ includeTerminal: true }))
  assert.deepEqual(
    workers.map(worker => [worker.worker_id, worker.state]),
    [
      ['worker-legacy-cancel', 'cancellation-requested'],
      ['worker-legacy-exited', 'exited'],
    ]
  )

  assert.deepEqual(
    workers.map(worker => [worker.worker_id, worker.child_pid]),
    [
      ['worker-legacy-cancel', null],
      ['worker-legacy-exited', null],
    ]
  )

  assert.equal(
    (await runFuture(store.workers.get('worker-legacy-cancel')))?.child_pid,
    null
  )

  const workerRows = db
    .prepare('SELECT worker_id, child_pid FROM workers ORDER BY worker_id')
    .all() as Array<{ worker_id: string; child_pid: number | null }>
  assert.deepEqual(workerRows, [
    { worker_id: 'worker-legacy-cancel', child_pid: null },
    { worker_id: 'worker-legacy-exited', child_pid: null },
  ])

  assert.equal(
    (await runFuture(store.workers.resolveCurrentByRun('run-legacy-cancel')))
      ?.worker_id,
    'worker-legacy-cancel'
  )
  assert.equal(
    await runFuture(store.workers.resolveCurrentByRun('run-legacy-exited')),
    null
  )

  db.close()
  await runFuture(store.close())
})
