import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, test } from 'node:test'

import { fork, type FutureInstance } from 'fluture'

import { createAutobotStore } from '@repro/autobot-store'

import { runWorkerCommand, type WorkerRunnerHooks } from '../worker-runner'

const tempRoots: string[] = []

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    future.pipe(fork(reject)(resolve))
  })
}

function runFutureWithTimeout<T>(
  future: FutureInstance<unknown, T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancel()
      reject(new Error(`future did not settle within ${timeoutMs}ms`))
    }, timeoutMs)
    const cancel = future.pipe(
      fork(error => {
        clearTimeout(timeout)
        reject(error)
      })(value => {
        clearTimeout(timeout)
        resolve(value)
      })
    )
  })
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 10))
  }

  throw new Error('timed out waiting for test condition')
}

async function makeRepoRoot() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const tmpDir = path.join(repoRoot, 'tmp')
  await mkdir(tmpDir, { recursive: true })
  const tempDir = await mkdtemp(
    path.join(tmpDir, 'autobot-worker-finalization-')
  )
  tempRoots.push(tempDir)
  return tempDir
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

class FakeChildProcess extends EventEmitter {
  pid: number
  stdout = new PassThrough()
  stderr = new PassThrough()

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  kill() {
    return true
  }
}

class SynchronousFinishWritable extends EventEmitter {
  ended = false
  writable = true

  write() {
    return true
  }

  end() {
    this.ended = true
    this.emit('finish')
    return this
  }
}

function makeSynchronousLogStreams() {
  return {
    stdout: new SynchronousFinishWritable(),
    stderr: new SynchronousFinishWritable(),
  }
}

function makeInput(repoRoot: string, workerId: string) {
  return {
    repo: {
      path: repoRoot,
      state_dir: '.autobot',
    },
    worker_id: workerId,
    issue_id: 'REP-1235',
    run_id: null,
    execution_id: null,
    command: 'opencode',
    args: ['run', '--agent', 'planner'],
    started_at: '2026-05-24T18:00:00Z',
    stdout_log_path: `.autobot/workers/${workerId}.stdout.log`,
    stderr_log_path: `.autobot/workers/${workerId}.stderr.log`,
  }
}

test('runWorkerCommand resolves when log streams finish synchronously during shutdown', async () => {
  const repoRoot = await makeRepoRoot()
  const store = await runFuture(
    createAutobotStore({
      repo: {
        path: repoRoot,
        state_dir: '.autobot',
      },
    })
  )
  const child = new FakeChildProcess(6235)
  const logStreams = makeSynchronousLogStreams()

  const hooks: WorkerRunnerHooks & {
    openLogStreams: () => Promise<{
      stdout: NodeJS.WritableStream
      stderr: NodeJS.WritableStream
    }>
  } = {
    now: () => '2026-05-24T18:00:01Z',
    spawn() {
      return child as unknown as never
    },
    openLogStreams: async () => logStreams,
  }

  const promise = runFutureWithTimeout(
    runWorkerCommand(makeInput(repoRoot, 'worker-sync-finish'), store, hooks),
    1_000
  )

  await waitFor(() => child.listenerCount('close') > 0)
  child.emit('close', 0, null)

  const result = await promise

  assert.equal(result.exit_code, 0)
  assert.equal(logStreams.stdout.ended, true)
  assert.equal(logStreams.stderr.ended, true)

  await runFuture(store.close())
})

test('runWorkerCommand rejects spawn errors after synchronous log stream shutdown', async () => {
  const repoRoot = await makeRepoRoot()
  const store = await runFuture(
    createAutobotStore({
      repo: {
        path: repoRoot,
        state_dir: '.autobot',
      },
    })
  )
  const child = new FakeChildProcess(7235)
  const logStreams = makeSynchronousLogStreams()
  const spawnError = new Error('cannot start worker process')

  const hooks: WorkerRunnerHooks & {
    openLogStreams: () => Promise<{
      stdout: NodeJS.WritableStream
      stderr: NodeJS.WritableStream
    }>
  } = {
    now: () => '2026-05-24T18:05:01Z',
    spawn() {
      return child as unknown as never
    },
    openLogStreams: async () => logStreams,
  }

  const promise = runFutureWithTimeout(
    runWorkerCommand(
      makeInput(repoRoot, 'worker-sync-spawn-error'),
      store,
      hooks
    ),
    1_000
  )

  await waitFor(() => child.listenerCount('error') > 0)
  child.emit('error', spawnError)

  await assert.rejects(promise, /cannot start worker process/)
  assert.equal(logStreams.stdout.ended, true)
  assert.equal(logStreams.stderr.ended, true)

  const worker = await runFuture(store.workers.get('worker-sync-spawn-error'))
  assert.equal(worker?.state, 'failed')
  assert.equal(worker?.spawn_error?.message, 'cannot start worker process')

  await runFuture(store.close())
})
