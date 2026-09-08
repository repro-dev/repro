import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  parseCliArgs,
  runAssert,
  type AssertOptions,
} from './assert-audit-artifacts.ts'

// CLI-mode tests (arg parsing, exit codes, io injection) live here; the
// pure-core assertion suites stay in assert-audit-artifacts.test.ts.
// Mirrors the classify-ui-diff.test.ts / classify-ui-diff.cli.test.ts split.

const GENERATED_AT = '2026-09-02T12:00:00.000Z'
const COMMIT_ISO = '2026-09-02T11:00:00.000Z'
const COMMIT_SHA = 'abc1234'
const SHOT_REL = 'tmp/ui-verification/REP-0000/shots/sessions-idle.png'

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'assert-audit-cli-'))
  // Files live at the DEFAULT derived path so tests exercise
  // <worktree-root>/tmp/ui-verification/<issue> derivation.
  const auditDir = path.join(root, 'tmp', 'ui-verification', 'REP-0000')
  mkdirSync(path.join(auditDir, 'shots'), { recursive: true })
  writeFileSync(path.join(auditDir, 'shots', 'sessions-idle.png'), 'png-bytes')

  // REP-1635: the manifest schema carries no canary/agentBrowserVersion fields.
  const manifest = {
    issue: 'REP-0000',
    generatedAt: GENERATED_AT,
    base: 'origin/main',
    surfaces: [
      {
        surface: 'workspace::Sessions',
        states: [
          {
            state: 'idle',
            screenshot: SHOT_REL,
            interactionNotes: 'loaded',
          },
        ],
      },
    ],
  }
  const writeArtifacts = () => {
    writeFileSync(
      path.join(auditDir, 'manifest.json'),
      JSON.stringify(manifest)
    )
    writeFileSync(
      path.join(auditDir, 'audit.md'),
      [
        '| pillar | severity | evidence screenshot | description | disposition |',
        '| --- | --- | --- | --- | --- |',
        `| layout | P1 | ${SHOT_REL} | overlap | fixed abc1234 |`,
      ].join('\n')
    )
  }
  writeArtifacts()

  return {
    root,
    auditDir,
    setBase(value: string) {
      manifest.base = value
      writeArtifacts()
    },
    removeManifest() {
      rmSync(path.join(auditDir, 'manifest.json'))
    },
    writeManifestText(text: string) {
      writeFileSync(path.join(auditDir, 'manifest.json'), text)
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

const stubIo = () => ({
  execGit: (args: string[]) => {
    assert.deepEqual(args, ['show', '-s', '--format=%cI', COMMIT_SHA])
    return `${COMMIT_ISO}\n`
  },
})

const baseOptions = {
  issue: 'REP-0000',
  base: 'origin/main',
  commit: COMMIT_SHA,
  surfaces: ['workspace::Sessions'],
}

describe('REP-1653 CLI parsing', () => {
  it('parses issue, audit-dir, base, commit, worktree-root, and repeatable --surface', () => {
    assert.deepEqual(
      parseCliArgs([
        '--issue',
        'REP-1',
        '--audit-dir',
        'tmp/x',
        '--base',
        'origin/main',
        '--commit',
        'abc',
        '--surface',
        'a::B',
        '--surface',
        'c::D',
        '--worktree-root',
        '/wt',
      ]).options,
      {
        issue: 'REP-1',
        auditDir: 'tmp/x',
        base: 'origin/main',
        commit: 'abc',
        surfaces: ['a::B', 'c::D'],
        worktreeRoot: '/wt',
      }
    )
  })

  it('collapses duplicate --surface values', () => {
    assert.deepEqual(
      parseCliArgs(['--surface', 'a::B', '--surface', 'a::B']).options,
      { surfaces: ['a::B'] }
    )
  })

  it('parses --help and -h, and tolerates empty args', () => {
    assert.deepEqual(parseCliArgs(['--help']).options, { help: true })
    assert.deepEqual(parseCliArgs(['-h']).options, { help: true })
    assert.deepEqual(parseCliArgs([]).options, {})
  })

  it('rejects blank --surface values (classify error style)', () => {
    assert.match(
      parseCliArgs(['--surface', '']).error!,
      /--surface value "" is blank; expected a surface name/
    )
    assert.match(
      parseCliArgs(['--surface', '   ']).error!,
      /is blank; expected a surface name/
    )
  })

  it('rejects unknown flags and malformed values (classify error style)', () => {
    assert.match(parseCliArgs(['--bogus']).error!, /unknown argument "--bogus"/)
    assert.match(parseCliArgs(['--base']).error!, /requires a value/)
    assert.match(
      parseCliArgs(['--base', '--commit']).error!,
      /looks like another flag/
    )
    assert.match(parseCliArgs(['--surface']).error!, /requires a value/)
    assert.match(
      parseCliArgs(['--commit', '--surface', 'x']).error!,
      /looks like another flag/
    )
  })
})

describe('REP-1653 CLI exit codes', () => {
  it('exits 0 with ok:true JSON on a passing bundle, deriving the default audit dir', () => {
    const f = fixture()
    try {
      const jsonOuts: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 0)
      const report = JSON.parse(jsonOuts[0]!) as {
        mode: string
        issue: string
        auditDir: string
        ok: boolean
        results: Array<{ id: string; ok: boolean; detail?: string }>
      }
      assert.equal(report.mode, 'assert-audit')
      assert.equal(report.issue, 'REP-0000')
      assert.equal(report.auditDir, f.auditDir)
      assert.equal(report.ok, true)
      assert.equal(report.results.length, 6)
      for (const entry of report.results) {
        assert.equal(entry.ok, true, entry.id)
      }
      // REP-1635: no canary assertion exists in the result list.
      assert.ok(!report.results.some(r => r.id === 'canary'))
    } finally {
      f.cleanup()
    }
  })

  it('exits 1 with JSON listing the failed assertions on a gate violation', () => {
    const f = fixture()
    try {
      f.setBase('feature/branch')
      const jsonOuts: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 1)
      const report = JSON.parse(jsonOuts[0]!) as {
        ok: boolean
        results: Array<{ id: string; ok: boolean; detail?: string }>
      }
      assert.equal(report.ok, false)
      const failed = report.results.filter(r => !r.ok)
      assert.deepEqual(
        failed.map(r => r.id),
        ['freshness']
      )
      assert.match(failed[0]?.detail ?? '', /classification base/)
    } finally {
      f.cleanup()
    }
  })

  it('exits 1 with JSON for a manifest whose root is null (fail-closed)', () => {
    const f = fixture()
    try {
      // Blocker regression: a `null` manifest must not report ok:true.
      f.writeManifestText('null')
      const jsonOuts: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 1)
      assert.equal(jsonOuts.length, 1)
      const report = JSON.parse(jsonOuts[0]!) as {
        ok: boolean
        results: Array<{ id: string; ok: boolean; detail?: string }>
      }
      assert.equal(report.ok, false)
      assert.equal(
        report.results.find(r => r.id === 'manifest-parses')?.ok,
        false
      )
    } finally {
      f.cleanup()
    }
  })

  it('emits the JSON report (no uncaught crash) when surfaces contains a null entry', () => {
    const f = fixture()
    try {
      f.writeManifestText(
        JSON.stringify({
          issue: 'REP-0000',
          generatedAt: GENERATED_AT,
          base: 'origin/main',
          surfaces: [null],
        })
      )
      const jsonOuts: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 1)
      assert.equal(jsonOuts.length, 1)
      const report = JSON.parse(jsonOuts[0]!) as {
        ok: boolean
        results: Array<{ id: string; ok: boolean; detail?: string }>
      }
      assert.equal(report.ok, false)
      const nonempty = report.results.find(r => r.id === 'manifest-nonempty')
      assert.equal(nonempty?.ok, false)
      assert.match(
        nonempty?.detail ?? '',
        /surfaces\[0\] is not an object \(null\)/
      )
    } finally {
      f.cleanup()
    }
  })

  it('is non-zero with no JSON verdict on a missing manifest file', () => {
    const f = fixture()
    try {
      f.removeManifest()
      const jsonOuts: string[] = []
      const errors: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
          errorOut: message => errors.push(message),
        }
      )
      assert.equal(result.code, 1)
      assert.deepEqual(jsonOuts, [])
      assert.match(errors[0]!, /unreadable/)
      assert.match(errors[0]!, /manifest\.json/)
    } finally {
      f.cleanup()
    }
  })

  it('exits 1 with an ERROR when git cannot resolve the commit', () => {
    const f = fixture()
    try {
      const jsonOuts: string[] = []
      const errors: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          execGit: () => {
            throw new Error(`fatal: bad revision '${COMMIT_SHA}'`)
          },
          jsonOut: json => jsonOuts.push(json),
          errorOut: message => errors.push(message),
        }
      )
      assert.equal(result.code, 1)
      assert.deepEqual(jsonOuts, [])
      assert.match(errors[0]!, /resolving --commit abc1234 timestamp failed/)
      assert.match(errors[0]!, /bad revision/)
    } finally {
      f.cleanup()
    }
  })

  it('feeds the resolved commit time into freshness (stubbed execGit)', () => {
    const f = fixture()
    try {
      // Commit AFTER generatedAt -> freshness must fail (replayed artifacts).
      const jsonOuts: string[] = []
      const result = runAssert(
        { ...baseOptions, worktreeRoot: f.root },
        {
          execGit: (args: string[]) => {
            assert.deepEqual(args, ['show', '-s', '--format=%cI', COMMIT_SHA])
            return '2026-09-02T13:00:00.000Z\n'
          },
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 1)
      const report = JSON.parse(jsonOuts[0]!) as {
        results: Array<{ id: string; ok: boolean }>
      }
      const freshness = report.results.find(r => r.id === 'freshness')
      assert.equal(freshness?.ok, false)
    } finally {
      f.cleanup()
    }
  })
})

describe('REP-1653 CLI required-argument errors', () => {
  // Options-object helper: drop the given keys to simulate the flag being
  // omitted on the command line.
  const without = (...keys: string[]): AssertOptions => {
    const copy: AssertOptions = { ...baseOptions }
    for (const key of keys) delete copy[key as keyof AssertOptions]
    return copy
  }

  it('requires --issue unless --audit-dir is provided', () => {
    const f = fixture()
    try {
      const errors: string[] = []
      const result = runAssert(without('issue'), {
        ...stubIo(),
        errorOut: message => errors.push(message),
      })
      assert.equal(result.code, 1)
      assert.match(errors[0]!, /--issue/)
    } finally {
      f.cleanup()
    }
  })

  it('requires --base, --commit, and at least one --surface', () => {
    const f = fixture()
    try {
      for (const options of [
        without('base'),
        without('commit'),
        without('surfaces'),
      ]) {
        const errors: string[] = []
        const result = runAssert(options, {
          execGit: () => COMMIT_ISO,
          errorOut: message => errors.push(message),
        })
        assert.equal(result.code, 1, JSON.stringify(options))
        assert.doesNotMatch(errors[0] ?? '', /--issue/, JSON.stringify(options))
      }
    } finally {
      f.cleanup()
    }
  })

  it('accepts --audit-dir as the --issue alternative', () => {
    const f = fixture()
    try {
      const jsonOuts: string[] = []
      const result = runAssert(
        {
          auditDir: 'tmp/ui-verification/REP-0000',
          base: 'origin/main',
          commit: COMMIT_SHA,
          surfaces: ['workspace::Sessions'],
          worktreeRoot: f.root,
        },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 0)
      const report = JSON.parse(jsonOuts[0]!) as { issue: string }
      // issue falls back to the audit dir basename.
      assert.equal(report.issue, 'REP-0000')
    } finally {
      f.cleanup()
    }
  })

  it('resolves an --audit-dir override relative to the worktree root', () => {
    const f = fixture()
    try {
      const jsonOuts: string[] = []
      const result = runAssert(
        {
          ...baseOptions,
          auditDir: 'tmp/ui-verification/REP-0000',
          worktreeRoot: f.root,
        },
        {
          ...stubIo(),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 0)
      const report = JSON.parse(jsonOuts[0]!) as { auditDir: string }
      assert.equal(report.auditDir, f.auditDir)
    } finally {
      f.cleanup()
    }
  })
})
