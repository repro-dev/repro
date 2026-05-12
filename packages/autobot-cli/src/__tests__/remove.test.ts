import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { runAutobot } from '../commands/autobot'
import { loadQueuePayload, saveQueuePayload } from '../runtime'

function makeRepoRoot(): { restore: () => void } {
  const mainCheckout = path.resolve(process.cwd(), '../..')
  const tmpRoot = path.join(mainCheckout, 'tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, 'autobot-cli-remove-'))
  const repoDir = path.join(tmpdir, 'repo')
  fs.mkdirSync(path.join(repoDir, '.autobot'), { recursive: true })
  const originalRepoRoot = process.env.REPO_ROOT
  process.env.REPO_ROOT = repoDir

  return {
    restore: () => {
      if (originalRepoRoot === undefined) {
        delete process.env.REPO_ROOT
      } else {
        process.env.REPO_ROOT = originalRepoRoot
      }
      fs.rmSync(tmpdir, { recursive: true, force: true })
    },
  }
}

test('remove refuses active work without force and handles forced removals', () => {
  const { restore } = makeRepoRoot()
  const writes: string[] = []
  const write = test.mock.method(
    process.stdout,
    'write',
    (chunk: string | Uint8Array) => {
      writes.push(String(chunk))
      return true
    }
  )

  saveQueuePayload({
    items: [
      {
        issue_identifier: 'REP-1',
        claim_state: 'developing',
        workspace_path: '/work/rep-1',
      },
      {
        issue_identifier: 'REP-2',
        claim_state: 'failed',
        workspace_path: '/work/rep-2',
      },
    ],
  })

  try {
    runAutobot(['node', 'autobot', 'remove', 'REP-1', '--json'])
    assert.deepEqual(JSON.parse(writes.join('').trim()), {
      removed: false,
      reason: 'active work',
      issue_identifier: 'REP-1',
    })

    writes.length = 0
    runAutobot(['node', 'autobot', 'remove', 'REP-1', '--force', '--json'])
    assert.deepEqual(JSON.parse(writes.join('').trim()), {
      removed: true,
      issue_identifier: 'REP-1',
      state: 'released',
    })
    const items = loadQueuePayload().items as Array<{
      claim_state?: string
      issue_identifier: string
    }>
    assert.equal(
      items.find(item => item.issue_identifier === 'REP-1')?.claim_state,
      'released'
    )

    writes.length = 0
    runAutobot(['node', 'autobot', 'remove', 'REP-2', '-f', '--json'])
    assert.deepEqual(JSON.parse(writes.join('').trim()), {
      removed: true,
      issue_identifier: 'REP-2',
      state: 'canceled',
    })
    const nextItems = loadQueuePayload().items as Array<{
      claim_state?: string
      issue_identifier: string
    }>
    assert.equal(
      nextItems.find(item => item.issue_identifier === 'REP-2')?.claim_state,
      'canceled'
    )
  } finally {
    write.mock.restore()
    restore()
  }
})
