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
        attempt_count INTEGER,
        issue_title TEXT
      );
      CREATE TABLE runs (
        issue_identifier TEXT PRIMARY KEY,
        claim_state TEXT,
        workspace_path TEXT,
        attempt_count INTEGER,
        issue_title TEXT
      );
    `)
    db.prepare(
      'INSERT INTO claims (issue_identifier, claim_state, workspace_path, attempt_count, issue_title) VALUES (?, ?, ?, ?, ?)'
    ).run('REP-1', 'queued', '/work/claim-1', 0, 'Claim title')
    db.prepare(
      'INSERT INTO claims (issue_identifier, claim_state, workspace_path, attempt_count, issue_title) VALUES (?, ?, ?, ?, ?)'
    ).run('REP-2', 'queued', '/work/claim-2', 1, 'Claimed-only title')
    db.prepare(
      'INSERT INTO runs (issue_identifier, claim_state, workspace_path, attempt_count, issue_title) VALUES (?, ?, ?, ?, ?)'
    ).run('REP-1', 'running', '/work/run-1', 5, 'Run title')
    db.prepare(
      'INSERT INTO runs (issue_identifier, claim_state, workspace_path, attempt_count, issue_title) VALUES (?, ?, ?, ?, ?)'
    ).run('REP-3', 'running', '/work/run-3', 2, 'Run only title')
    db.close()

    const payload = loadQueuePayload()
    const items = (payload.items ?? []) as Array<{
      claim_state?: string
      issue_identifier: string
      issue_title?: string
      workspace_path?: string
    }>
    assert.deepEqual(items.map(item => item.issue_identifier).sort(), [
      'REP-1',
      'REP-2',
      'REP-3',
    ])
    const shared = items.find(item => item.issue_identifier === 'REP-1')
    assert.equal(shared?.claim_state, 'queued')
    assert.equal(shared?.workspace_path, '/work/claim-1')
    assert.equal(shared?.issue_title, 'Claim title')

    const runOnly = items.find(item => item.issue_identifier === 'REP-3')
    assert.equal(runOnly?.claim_state, 'running')
    assert.equal(runOnly?.workspace_path, '/work/run-3')

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
        ['REP-1', 'REP-2', 'REP-3']
      )
    } finally {
      canonicalDb.close()
    }
  } finally {
    restore()
  }
})
