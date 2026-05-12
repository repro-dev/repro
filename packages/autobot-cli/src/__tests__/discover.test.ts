import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { runAutobot } from '../commands/autobot'
import { saveQueuePayload } from '../runtime'

function makeRepoRoot(): { repoDir: string; restore: () => void } {
  const mainCheckout = path.resolve(process.cwd(), '../..')
  const tmpRoot = path.join(mainCheckout, 'tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, 'autobot-cli-discover-'))
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

test('discover shows issue metadata by default and ids in quiet mode', () => {
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
        claim_state: 'queued',
        linear: {
          issue: {
            title: 'Migrate autobot CLI',
            priority: 1,
            assignee: { name: 'Ada Lovelace' },
            labels: [{ name: 'Tech Debt' }],
          },
        },
      },
    ],
  })

  try {
    runAutobot(['node', 'autobot', 'discover'])
    assert.equal(writes.join('').includes('Migrate autobot CLI'), true)
    assert.equal(writes.join('').includes('Ada Lovelace'), true)
    assert.equal(writes.join('').includes('Tech Debt'), true)
    assert.equal(writes.join('').includes('REP-1'), true)

    writes.length = 0
    runAutobot(['node', 'autobot', 'discover', '-q'])
    assert.equal(writes.join('').trim(), 'REP-1')
  } finally {
    write.mock.restore()
    restore()
  }
})

test('discover filters by project and preserves the project in json output', () => {
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
        issue_identifier: 'REP-10',
        claim_state: 'queued',
        linear: {
          issue: {
            title: 'Ship the platform fix',
            project: { name: 'Platform' },
          },
        },
      },
      {
        issue_identifier: 'REP-11',
        claim_state: 'queued',
        linear: {
          issue: {
            title: 'Unrelated design task',
            project: { name: 'Design System' },
          },
        },
      },
    ],
  })

  try {
    runAutobot([
      'node',
      'autobot',
      'discover',
      '--project',
      'Platform',
      '--json',
    ])
    const result = JSON.parse(writes.join('').trim()) as {
      project?: string
      items: Array<{ issue_identifier: string; issue_project?: string }>
    }
    assert.equal(result.project, 'Platform')
    assert.deepEqual(
      result.items.map(item => item.issue_identifier),
      ['REP-10']
    )
    assert.equal(result.items[0]?.issue_project, 'Platform')
  } finally {
    write.mock.restore()
    restore()
  }
})

test('discover falls back to Linear and filters project-aware responses', () => {
  const { restore } = makeRepoRoot()
  const writes: string[] = []
  const mainCheckout = path.resolve(process.cwd(), '../..')
  const stubDir = fs.mkdtempSync(path.join(mainCheckout, 'tmp', 'linear-stub-'))
  const linearPath = path.join(stubDir, 'linear')
  fs.writeFileSync(
    linearPath,
    `#!/bin/sh
case "$4" in
  backlog)
    printf '%s' '{"items":[{"identifier":"REP-20","project":{"name":"Platform"}},{"identifier":"REP-21","project":{"name":"Design System"}}]}'
    ;;
  todo)
    printf '%s' '[{"identifier":"REP-22","project_name":"Platform"},{"identifier":"REP-23","project":{"name":"Engineering"}}]'
    ;;
  *)
    exit 1
    ;;
esac
`
  )
  fs.chmodSync(linearPath, 0o755)
  const originalPath = process.env.PATH ?? ''
  process.env.PATH = `${stubDir}:${originalPath}`
  const write = test.mock.method(
    process.stdout,
    'write',
    (chunk: string | Uint8Array) => {
      writes.push(String(chunk))
      return true
    }
  )

  saveQueuePayload({ items: [] })

  try {
    runAutobot([
      'node',
      'autobot',
      'discover',
      '--project',
      'Platform',
      '--json',
    ])
    const result = JSON.parse(writes.join('').trim()) as {
      items: Array<{ issue_identifier: string }>
      project?: string
    }
    assert.equal(result.project, 'Platform')
    assert.deepEqual(
      result.items.map(item => item.issue_identifier),
      ['REP-20', 'REP-22']
    )
  } finally {
    write.mock.restore()
    process.env.PATH = originalPath
    fs.rmSync(stubDir, { recursive: true, force: true })
    restore()
  }
})

test('discover ignores legacy waves when filtering by project', () => {
  const { restore } = makeRepoRoot()
  const writes: string[] = []
  const mainCheckout = path.resolve(process.cwd(), '../..')
  const stubDir = fs.mkdtempSync(path.join(mainCheckout, 'tmp', 'linear-stub-'))
  const linearPath = path.join(stubDir, 'linear')
  fs.writeFileSync(
    linearPath,
    `#!/bin/sh
printf '%s' '{"items":[{"identifier":"REP-30","project":{"name":"Platform"}}]}'
`
  )
  fs.chmodSync(linearPath, 0o755)
  const originalPath = process.env.PATH ?? ''
  process.env.PATH = `${stubDir}:${originalPath}`
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
        issue_identifier: 'REP-31',
        claim_state: 'queued',
        linear: {
          issue: {
            title: 'Unrelated queue-local work',
            project: { name: 'Design System' },
          },
        },
      },
    ],
    waves: [
      {
        issues: [
          {
            issue_identifier: 'REP-99',
          },
        ],
      },
    ],
  })

  try {
    runAutobot([
      'node',
      'autobot',
      'discover',
      '--project',
      'Platform',
      '--json',
    ])
    const result = JSON.parse(writes.join('').trim()) as {
      items: Array<{ issue_identifier: string }>
      project?: string
    }
    assert.equal(result.project, 'Platform')
    assert.deepEqual(
      result.items.map(item => item.issue_identifier),
      ['REP-30']
    )
  } finally {
    write.mock.restore()
    process.env.PATH = originalPath
    fs.rmSync(stubDir, { recursive: true, force: true })
    restore()
  }
})
