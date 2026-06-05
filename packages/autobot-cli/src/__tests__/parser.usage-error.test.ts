import assert from 'node:assert/strict'
import test from 'node:test'

import { fork, type FutureInstance } from 'fluture'

import { runAutobotCli } from '../run'

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    future.pipe(fork(reject)(resolve))
  })
}

test('usage errors in json mode still emit a json envelope', async () => {
  let stdout = ''
  let stderr = ''

  const exitCode = await runFuture(
    runAutobotCli(['node', 'autobot-next', '--json', 'bogus', 'secret-token'], {
      stdout: {
        write(chunk: string) {
          stdout += chunk
          return true
        },
      },
      stderr: {
        write(chunk: string) {
          stderr += chunk
          return true
        },
      },
    })
  )

  assert.equal(exitCode, 2)
  assert.equal(stderr, '')

  const envelope = JSON.parse(stdout)

  assert.equal(envelope.ok, false)
  assert.equal(envelope.schema_version, 1)
  assert.equal(envelope.command, 'autobot-next')
  assert.equal(envelope.error.code, 'AUTOBOT-USAGE-ERROR')
  assert.equal(envelope.error.message, 'Invalid command usage')
  assert.equal('repo' in envelope, false)
  assert.equal(JSON.stringify(envelope).includes('secret-token'), false)
})
