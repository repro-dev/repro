import { fork, type FutureInstance } from 'fluture'

import { createAutobotStore } from '@repro/autobot-store'

import {
  parseWorkerRunnerInput,
  runWorkerCommand,
  type WorkerCommandInput,
} from './worker-runner'

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    fork(rejectPromise)(resolvePromise)(future)
  })
}

export async function main(argv: string[]) {
  const rawInput = argv[2]

  if (rawInput === undefined) {
    throw new Error('worker runner requires a serialized input payload')
  }

  const input = parseWorkerRunnerInput(rawInput) as WorkerCommandInput
  const store = await runFuture(
    createAutobotStore({
      repo: input.repo,
      skipMigrations: true,
    })
  )

  try {
    const result = await runFuture(
      runWorkerCommand(input, store, { trapSignals: true })
    )
    process.exitCode = result.exit_code ?? 0
  } finally {
    await runFuture(store.close())
  }
}

if (require.main === module) {
  void main(process.argv).catch(error => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
