import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

test('package-local autobot state directory is gitignored', () => {
  const repoRoot = path.resolve(process.cwd(), '../..')
  const target = path.join(
    repoRoot,
    'packages/autobot-cli/.autobot/state.sqlite'
  )

  assert.doesNotThrow(() => {
    execFileSync('git', ['check-ignore', '-q', target], { cwd: repoRoot })
  })
})
