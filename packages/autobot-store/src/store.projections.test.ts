import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, test } from 'node:test'

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
  const tempDir = await mkdtemp(path.join(tmpDir, 'autobot-store-projections-'))
  tempRoots.push(tempDir)
  return tempDir
}

async function openStore(repoRoot: string): Promise<AutobotStore> {
  return runFuture<AutobotStore>(createAutobotStore({ repo: repoRoot }))
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('item detail current worker lookup falls through execution run and issue ids', async () => {
  const repoRoot = await makeRepoRoot()
  const store = await openStore(repoRoot)

  await runFuture(
    store.items.upsert({
      issue_id: 'REP-1221-execution',
      title: 'Execution fallback',
      url: 'https://linear.app/repro/issue/REP-1221-execution/execution-fallback',
      state: 'claimed',
      attempt: 1,
      priority: 2,
      owner: 'gary',
      workspace: 'repro',
      branch: 'autobot/REP-1221-execution',
      queued_at: '2026-05-21T10:00:00Z',
      started_at: '2026-05-21T10:05:00Z',
      updated_at: '2026-05-21T10:06:00Z',
      last_event: 'item.claimed',
      last_error: null,
      recovery_commands: [],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: 'In Progress',
      state_type: 'started',
      project: 'Platform',
      labels: ['Feature'],
      assignee: 'Gary',
      current_run_id: 'run-execution',
    })
  )

  await runFuture(
    store.runs.upsert({
      run_id: 'run-execution',
      issue_id: 'REP-1221-execution',
      attempt: 1,
      state: 'claimed',
      flowcraft_execution_id: 'flowcraft-execution',
      blueprint_id: 'autobot-deliver-issue',
      blueprint_version: '1.0.0',
      started_at: '2026-05-21T10:05:00Z',
      finished_at: null,
      worker_id: 'missing-worker',
      last_heartbeat_at: '2026-05-21T10:05:30Z',
      transport: null,
    })
  )

  await runFuture(
    store.workers.upsert({
      worker_id: 'worker-execution',
      issue_id: null,
      run_id: null,
      flowcraft_execution_id: 'flowcraft-execution',
      workflow_node_id: 'planning',
      phase: 'planning',
      state: 'running',
      pid: 4242,
      process_group_id: 4242,
      command: 'autobot-next run-worker',
      args: ['--issue', 'REP-1221-execution'],
      started_at: '2026-05-21T10:05:00Z',
      last_heartbeat_at: '2026-05-21T10:05:30Z',
      deadline_at: null,
      stdout_log_path: '.autobot/workers/worker-execution.stdout.log',
      stderr_log_path: '.autobot/workers/worker-execution.stderr.log',
      result: null,
      result_artifact_path: null,
      exit_code: null,
      signal: null,
      finished_at: null,
    })
  )

  await runFuture(
    store.items.upsert({
      issue_id: 'REP-1221-run',
      title: 'Run fallback',
      url: 'https://linear.app/repro/issue/REP-1221-run/run-fallback',
      state: 'claimed',
      attempt: 1,
      priority: 2,
      owner: 'gary',
      workspace: 'repro',
      branch: 'autobot/REP-1221-run',
      queued_at: '2026-05-21T11:00:00Z',
      started_at: '2026-05-21T11:05:00Z',
      updated_at: '2026-05-21T11:06:00Z',
      last_event: 'item.claimed',
      last_error: null,
      recovery_commands: [],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: 'In Progress',
      state_type: 'started',
      project: 'Platform',
      labels: ['Feature'],
      assignee: 'Gary',
      current_run_id: 'run-fallback',
    })
  )

  await runFuture(
    store.runs.upsert({
      run_id: 'run-fallback',
      issue_id: 'REP-1221-run',
      attempt: 1,
      state: 'claimed',
      flowcraft_execution_id: null,
      blueprint_id: 'autobot-deliver-issue',
      blueprint_version: '1.0.0',
      started_at: '2026-05-21T11:05:00Z',
      finished_at: null,
      worker_id: 'missing-worker',
      last_heartbeat_at: '2026-05-21T11:05:30Z',
      transport: null,
    })
  )

  await runFuture(
    store.workers.upsert({
      worker_id: 'worker-run',
      issue_id: null,
      run_id: 'run-fallback',
      flowcraft_execution_id: null,
      workflow_node_id: 'testing',
      phase: 'testing',
      state: 'starting',
      pid: 5252,
      process_group_id: null,
      command: 'autobot-next run-worker',
      args: ['--issue', 'REP-1221-run'],
      started_at: '2026-05-21T11:05:00Z',
      last_heartbeat_at: '2026-05-21T11:05:30Z',
      deadline_at: null,
      stdout_log_path: '.autobot/workers/worker-run.stdout.log',
      stderr_log_path: '.autobot/workers/worker-run.stderr.log',
      result: null,
      result_artifact_path: null,
      exit_code: null,
      signal: null,
      finished_at: null,
    })
  )

  await runFuture(
    store.items.upsert({
      issue_id: 'REP-1221-issue',
      title: 'Issue fallback',
      url: 'https://linear.app/repro/issue/REP-1221-issue/issue-fallback',
      state: 'claimed',
      attempt: 1,
      priority: 2,
      owner: 'gary',
      workspace: 'repro',
      branch: 'autobot/REP-1221-issue',
      queued_at: '2026-05-21T12:00:00Z',
      started_at: '2026-05-21T12:05:00Z',
      updated_at: '2026-05-21T12:06:00Z',
      last_event: 'item.claimed',
      last_error: null,
      recovery_commands: [],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: 'In Progress',
      state_type: 'started',
      project: 'Platform',
      labels: ['Feature'],
      assignee: 'Gary',
      current_run_id: 'run-issue',
    })
  )

  await runFuture(
    store.runs.upsert({
      run_id: 'run-issue',
      issue_id: 'REP-1221-issue',
      attempt: 1,
      state: 'claimed',
      flowcraft_execution_id: null,
      blueprint_id: 'autobot-deliver-issue',
      blueprint_version: '1.0.0',
      started_at: '2026-05-21T12:05:00Z',
      finished_at: null,
      worker_id: 'missing-worker',
      last_heartbeat_at: '2026-05-21T12:05:30Z',
      transport: null,
    })
  )

  await runFuture(
    store.workers.upsert({
      worker_id: 'worker-issue',
      issue_id: 'REP-1221-issue',
      run_id: null,
      flowcraft_execution_id: null,
      workflow_node_id: 'reconciling',
      phase: 'reconciling',
      state: 'cancellation-requested',
      pid: 6262,
      process_group_id: null,
      command: 'autobot-next run-worker',
      args: ['--issue', 'REP-1221-issue'],
      started_at: '2026-05-21T12:05:00Z',
      last_heartbeat_at: '2026-05-21T12:05:30Z',
      deadline_at: null,
      stdout_log_path: '.autobot/workers/worker-issue.stdout.log',
      stderr_log_path: '.autobot/workers/worker-issue.stderr.log',
      result: null,
      result_artifact_path: null,
      exit_code: null,
      signal: null,
      finished_at: null,
    })
  )

  const executionDetail = await runFuture(
    store.projections.getItemDetail('REP-1221-execution')
  )
  assert.equal(executionDetail?.current_worker?.worker_id, 'worker-execution')

  const runDetail = await runFuture(
    store.projections.getItemDetail('REP-1221-run')
  )
  assert.equal(runDetail?.current_worker?.worker_id, 'worker-run')

  const issueDetail = await runFuture(
    store.projections.getItemDetail('REP-1221-issue')
  )
  assert.equal(issueDetail?.current_worker?.worker_id, 'worker-issue')

  await runFuture(store.close())
})
