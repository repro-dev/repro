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
  const tempDir = await mkdtemp(path.join(tmpDir, 'autobot-store-workers-'))
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

test('creates and updates durable worker lifecycle records', async () => {
  const repoRoot = await makeRepoRoot()
  const store = await openStore(repoRoot)

  const created = await runFuture(
    store.workers.create({
      worker_id: 'worker-1',
      issue_id: 'REP-1221',
      run_id: 'run-1221',
      flowcraft_execution_id: 'flowcraft-1221',
      workflow_node_id: 'developing',
      phase: 'developing',
      state: 'starting',
      pid: null,
      process_group_id: null,
      command: 'autobot-next run-worker',
      args: ['--issue', 'REP-1221'],
      started_at: '2026-05-21T15:00:00Z',
      last_heartbeat_at: null,
      deadline_at: '2026-05-21T16:00:00Z',
      stdout_log_path: '.autobot/workers/worker-1.stdout.log',
      stderr_log_path: '.autobot/workers/worker-1.stderr.log',
      result: null,
      result_artifact_path: null,
      exit_code: null,
      signal: null,
      finished_at: null,
    })
  )

  assert.equal(created.state, 'starting')
  assert.equal(created.pid, null)
  assert.deepEqual(created.args, ['--issue', 'REP-1221'])
  assert.equal(created.stdout_log_path, '.autobot/workers/worker-1.stdout.log')

  const running = await runFuture(
    store.workers.update({
      ...created,
      state: 'running',
      pid: 4242,
      process_group_id: 4242,
      last_heartbeat_at: '2026-05-21T15:05:00Z',
      workflow_node_id: 'testing',
      phase: 'testing',
    })
  )

  assert.equal(running.state, 'running')
  assert.equal(running.pid, 4242)
  assert.equal(running.process_group_id, 4242)
  assert.equal(running.last_heartbeat_at, '2026-05-21T15:05:00Z')

  const resolvedByRun = await runFuture(
    store.workers.resolveCurrentByRun('run-1221')
  )
  assert.equal(resolvedByRun?.worker_id, 'worker-1')
  assert.equal(resolvedByRun?.state, 'running')

  const resolvedByIssue = await runFuture(
    store.workers.resolveCurrentByIssue('REP-1221')
  )
  assert.equal(resolvedByIssue?.worker_id, 'worker-1')

  const resolvedByExecution = await runFuture(
    store.workers.resolveCurrentByFlowcraftExecution('flowcraft-1221')
  )
  assert.equal(resolvedByExecution?.worker_id, 'worker-1')

  const completed = await runFuture(
    store.workers.update({
      ...running,
      state: 'completed',
      last_heartbeat_at: '2026-05-21T15:06:00Z',
      finished_at: '2026-05-21T15:06:01Z',
      exit_code: 0,
      signal: null,
      result: { ok: true },
      result_artifact_path: '.autobot/workers/worker-1.result.json',
    })
  )

  assert.equal(completed.state, 'completed')
  assert.deepEqual(completed.result, { ok: true })
  assert.equal(completed.exit_code, 0)
  assert.equal(completed.finished_at, '2026-05-21T15:06:01Z')

  assert.equal(
    await runFuture(store.workers.resolveCurrentByRun('run-1221')),
    null
  )
  assert.equal(
    await runFuture(store.workers.resolveCurrentByIssue('REP-1221')),
    null
  )
  assert.equal(
    await runFuture(
      store.workers.resolveCurrentByFlowcraftExecution('flowcraft-1221')
    ),
    null
  )

  const allWorkers = await runFuture(store.workers.list())
  assert.equal(allWorkers[0]?.worker_id, 'worker-1')
  assert.equal(allWorkers[0]?.state, 'completed')
  assert.equal(
    allWorkers[0]?.result_artifact_path,
    '.autobot/workers/worker-1.result.json'
  )

  await runFuture(store.close())
})

test('lists stale orphan workers without depending on issue or run ids', async () => {
  const repoRoot = await makeRepoRoot()
  const store = await openStore(repoRoot)

  await runFuture(
    store.workers.create({
      worker_id: 'worker-orphan',
      issue_id: null,
      run_id: null,
      flowcraft_execution_id: null,
      workflow_node_id: 'planning',
      phase: 'planning',
      state: 'stale',
      pid: null,
      process_group_id: null,
      command: 'autobot-next run-worker',
      args: [],
      started_at: '2026-05-21T14:00:00Z',
      last_heartbeat_at: '2026-05-21T14:05:00Z',
      deadline_at: null,
      stdout_log_path: '.autobot/workers/worker-orphan.stdout.log',
      stderr_log_path: '.autobot/workers/worker-orphan.stderr.log',
      result: null,
      result_artifact_path: null,
      exit_code: null,
      signal: null,
      finished_at: null,
    })
  )

  const listed = await runFuture(store.workers.list({ includeTerminal: false }))
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.worker_id, 'worker-orphan')
  assert.equal(listed[0]?.issue_id, null)
  assert.equal(listed[0]?.run_id, null)
  assert.equal(listed[0]?.flowcraft_execution_id, null)
  assert.equal(listed[0]?.state, 'stale')

  const db = openRawDb(repoRoot)
  const row = db
    .prepare('SELECT result_json, args_json FROM workers WHERE worker_id = ?')
    .get('worker-orphan') as { result_json: string | null; args_json: string }
  assert.equal(row.result_json, null)
  assert.equal(row.args_json, '[]')
  db.close()

  await runFuture(store.close())
})
