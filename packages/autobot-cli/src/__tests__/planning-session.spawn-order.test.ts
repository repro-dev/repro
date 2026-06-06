import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { afterEach, mock, test } from 'node:test'

import { fork, resolve, type FutureInstance } from 'fluture'

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    fork(rejectPromise)(resolvePromise)(future)
  })
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return
    }

    await new Promise(resolvePromise => setImmediate(resolvePromise))
  }

  throw new Error('timed out waiting for test condition')
}

afterEach(() => {
  mock.reset()
})

function makeFakeWorker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    worker_id: 'worker-run-1222',
    issue_id: 'REP-1222',
    run_id: 'run-1222',
    flowcraft_execution_id: 'flowcraft-1222',
    workflow_node_id: 'plan',
    phase: 'plan',
    state: 'completed',
    pid: 4242,
    child_pid: 5252,
    process_group_id: 4242,
    command: 'opencode',
    args: ['run', '--agent', 'planner'],
    started_at: '2026-05-21T15:00:00Z',
    last_heartbeat_at: '2026-05-21T15:00:02Z',
    deadline_at: null,
    stdout_log_path: '.autobot/workers/worker-run-1222.stdout.log',
    stderr_log_path: '.autobot/workers/worker-run-1222.stderr.log',
    spawn_error: null,
    result: null,
    result_artifact_path: null,
    exit_code: 0,
    signal: null,
    finished_at: '2026-05-21T15:00:03Z',
    ...overrides,
  }
}

function makeFakeStore(worker: ReturnType<typeof makeFakeWorker>) {
  return {
    repo: {
      path: '/worktrees/autobot',
      state_dir: '.autobot',
    },
    workers: {
      get(workerId: string) {
        assert.equal(workerId, worker.worker_id)
        return resolve(worker as never)
      },
      upsert(input: typeof worker) {
        return resolve(input as never)
      },
      create(input: typeof worker) {
        return resolve(input as never)
      },
      update(input: typeof worker) {
        return resolve(input as never)
      },
    },
    close() {
      return resolve(undefined)
    },
  }
}

function makeWorkerInput() {
  return {
    phase: 'plan' as const,
    repo: {
      path: '/worktrees/autobot',
      state_dir: '.autobot',
    },
    issueId: 'REP-1222',
    attempt: 1,
    runId: 'run-1222',
    executionId: 'flowcraft-1222',
    artifactPaths: {
      context: '/worktrees/autobot/.autobot/runs/REP-1222/attempt-1/context.md',
      testPlan:
        '/worktrees/autobot/.autobot/runs/REP-1222/attempt-1/test-plan.md',
      contract:
        '/worktrees/autobot/.autobot/runs/REP-1222/attempt-1/contract.md',
      runPlan:
        '/worktrees/autobot/.autobot/runs/REP-1222/attempt-1/run-plan.md',
      prompt: '/worktrees/autobot/.autobot/runs/REP-1222/attempt-1/prompt.md',
    },
  }
}

test('runOpenCodePlanningSession spawns the wrapper before opening the store', async t => {
  let storeOpened = false
  const spawnCalls: Array<{ command: string; args: string[] }> = []
  const child = new EventEmitter() as EventEmitter & {
    pid: number
    kill: () => boolean
  }

  child.pid = 4242
  child.kill = () => true

  t.mock.module('@repro/autobot-store', {
    namedExports: {
      createAutobotStore() {
        storeOpened = true
        return resolve(makeFakeStore(makeFakeWorker()) as never)
      },
    },
  })

  t.mock.module('node:child_process', {
    namedExports: {
      spawn(command: string, args: string[]) {
        assert.equal(storeOpened, false)
        spawnCalls.push({ command, args })
        return child as never
      },
    },
  })

  const { runOpenCodePlanningSession } = (await import(
    '../planning-session'
  )) as typeof import('../planning-session')

  const resultPromise = runFuture(runOpenCodePlanningSession(makeWorkerInput()))

  await waitFor(() => spawnCalls.length === 1)
  child.emit('close', 0, null)

  const result = await resultPromise

  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0]?.command, process.execPath)
  assert.equal(storeOpened, true)
  assert.equal(result.exit_code, 0)
  assert.equal(result.signal, null)
})
