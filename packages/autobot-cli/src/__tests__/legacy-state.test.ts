import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { loadQueuePayload, stateDbPath } from '../runtime'

function makeRepoRoot(): { restore: () => void; repoDir: string } {
  const mainCheckout = path.resolve(process.cwd(), '../..')
  const tmpRoot = path.join(mainCheckout, 'tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, 'autobot-cli-legacy-state-'))
  const repoDir = path.join(tmpdir, 'repo')
  fs.mkdirSync(path.join(repoDir, '.autobot'), { recursive: true })
  const originalRepoRoot = process.env.REPO_ROOT
  process.env.REPO_ROOT = repoDir

  return {
    repoDir,
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

test('legacy claims and runs tables migrate into canonical queue state', () => {
  const { restore } = makeRepoRoot()

  try {
    const db = new DatabaseSync(stateDbPath())
    db.exec(`
      CREATE TABLE claims (
        issue_identifier TEXT PRIMARY KEY,
        claim_state TEXT,
        workspace_path TEXT,
        attempt_count INTEGER
      );
      CREATE TABLE runs (
        issue_identifier TEXT PRIMARY KEY,
        claim_state TEXT,
        workspace_path TEXT,
        attempt_count INTEGER
      );
    `)
    db.prepare(
      'INSERT INTO claims (issue_identifier, claim_state, workspace_path, attempt_count) VALUES (?, ?, ?, ?)'
    ).run('REP-1', 'queued', '/work/rep-1', 0)
    db.prepare(
      'INSERT INTO runs (issue_identifier, claim_state, workspace_path, attempt_count) VALUES (?, ?, ?, ?)'
    ).run('REP-2', 'running', '/work/rep-2', 2)
    db.close()

    const payload = loadQueuePayload()
    const items = (payload.items ?? []) as Array<{
      claim_state?: string
      issue_identifier: string
    }>
    assert.deepEqual(items.map(item => item.issue_identifier).sort(), [
      'REP-1',
      'REP-2',
    ])
    assert.equal(items[0]?.claim_state === 'queued', true)
    assert.equal(items[1]?.claim_state === 'running', true)

    const canonicalDb = new DatabaseSync(stateDbPath(), { readOnly: true })
    try {
      const row = canonicalDb
        .prepare('select value from state where key = ?')
        .get('queue') as { value?: string } | undefined
      assert.ok(row?.value)
      const migrated = JSON.parse(row.value) as {
        items?: Array<{ issue_identifier: string }>
      }
      assert.deepEqual(
        (migrated.items ?? []).map(item => item.issue_identifier).sort(),
        ['REP-1', 'REP-2']
      )
    } finally {
      canonicalDb.close()
    }
  } finally {
    restore()
  }
})
