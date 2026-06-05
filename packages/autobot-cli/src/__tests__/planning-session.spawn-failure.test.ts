import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import { fork, resolve, type FutureInstance } from 'fluture'

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    fork(rejectPromise)(resolvePromise)(future)
  })
}

afterEach(() => {
  mock.reset()
})

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

test('runOpenCodePlanningSession records wrapper spawn failures durably', async t => {
  const createAutobotStoreCalls: Array<Record<string, unknown>> = []
  const workerWrites: Array<Record<string, unknown>> = []

  t.mock.module('@repro/autobot-store', {
    namedExports: {
      createAutobotStore(input: Record<string, unknown>) {
        createAutobotStoreCalls.push(input)
        return resolve({
          repo: {
            path: '/worktrees/autobot',
            state_dir: '.autobot',
          },
          workers: {
            upsert(record: Record<string, unknown>) {
              workerWrites.push(record)
              return resolve(record as never)
            },
          },
          close() {
            return resolve(undefined)
          },
        } as never)
      },
    },
  })

  t.mock.module('node:child_process', {
    namedExports: {
      spawn() {
        throw new Error('wrapper failed to start')
      },
    },
  })

  const { runOpenCodePlanningSession } = (await import(
    '../planning-session'
  )) as typeof import('../planning-session')

  await assert.rejects(runFuture(runOpenCodePlanningSession(makeWorkerInput())))

  assert.equal(createAutobotStoreCalls.length, 1)
  assert.equal(createAutobotStoreCalls[0]?.skipMigrations, undefined)
  assert.equal(workerWrites.length, 1)
  assert.equal(workerWrites[0]?.state, 'failed')
  assert.equal(workerWrites[0]?.pid, null)
  const spawnError = workerWrites[0]?.spawn_error as
    | {
        code?: string
        message?: string
        occurred_at?: string
      }
    | undefined

  assert.deepEqual(spawnError, {
    code: 'AUTOBOT-WORKER-SPAWN-FAILED',
    message: 'wrapper failed to start',
    occurred_at: spawnError?.occurred_at,
  })
})
