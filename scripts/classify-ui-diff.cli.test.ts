import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseCliArgs, runClassify } from './classify-ui-diff.ts'

// CLI-mode tests (parsing, stdin mode, git mode) live here; the pure-core
// classifyPaths suites stay in classify-ui-diff.test.ts. Mirrors the
// pen-contract.test.ts / pen-contract.cli.test.ts split.

describe('REP-1646 CLI parsing', () => {
  it('parses --base, --head, --paths-from-stdin, and --help', () => {
    assert.deepEqual(parseCliArgs(['--base', 'origin/main']).options, {
      base: 'origin/main',
    })
    assert.deepEqual(
      parseCliArgs(['--base', 'origin/main', '--head', 'HEAD']).options,
      { base: 'origin/main', head: 'HEAD' }
    )
    assert.deepEqual(parseCliArgs(['--paths-from-stdin']).options, {
      pathsFromStdin: true,
    })
    assert.deepEqual(parseCliArgs(['--help']).options, { help: true })
    assert.deepEqual(parseCliArgs(['-h']).options, { help: true })
    assert.deepEqual(parseCliArgs([]).options, {})
  })

  it('rejects unknown flags and malformed values', () => {
    assert.match(parseCliArgs(['--bogus']).error!, /unknown argument "--bogus"/)
    assert.match(parseCliArgs(['--base']).error!, /requires a value/)
    assert.match(
      parseCliArgs(['--base', '--head']).error!,
      /looks like another flag/
    )
    assert.match(parseCliArgs(['--head']).error!, /requires a value/)
  })
})

describe('REP-1646 CLI stdin mode', () => {
  it('emits the full verdict JSON and exits 0, without echoing unobserved base/head', () => {
    const jsonOuts: string[] = []
    const result = runClassify(
      { pathsFromStdin: true },
      {
        stdin:
          'packages/buffer-utils/src/ring.ts\napps/workspace/src/routes/Sessions.tsx\napps/workspace/src/routes/Sessions.tsx\n',
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    const verdict = JSON.parse(jsonOuts[0]!) as {
      mode: string
      uiTouching: boolean
      matched: Array<{ path: string; rule: string }>
      totalChangedFiles: number
      base: string | null
      head: string | null
    }
    assert.equal(verdict.mode, 'classify')
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'apps/workspace/src/routes/Sessions.tsx', rule: 'app-ui' },
    ])
    assert.equal(verdict.totalChangedFiles, 2) // duplicates collapse
    // stdin mode never runs git — base/head are unobserved, never echoed.
    assert.equal(verdict.base, null)
    assert.equal(verdict.head, null)
  })

  it('reports null base/head even when flags are passed in stdin mode', () => {
    // Regression: stdin mode never runs git, so the verdict must not echo
    // --base/--head flags it never used.
    const jsonOuts: string[] = []
    const result = runClassify(
      { pathsFromStdin: true, base: 'origin/main' },
      {
        stdin: 'packages/buffer-utils/src/ring.ts\n',
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    const verdict = JSON.parse(jsonOuts[0]!) as {
      base: string | null
      head: string | null
    }
    assert.equal(verdict.base, null)
    assert.equal(verdict.head, null)
  })

  it('reports the non-UI skip path mechanically', () => {
    const jsonOuts: string[] = []
    const result = runClassify(
      { pathsFromStdin: true },
      {
        stdin:
          'scripts/pen-lint.ts\npackage.json\n.opencode/skills/review-standards/SKILL.md\n',
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    const verdict = JSON.parse(jsonOuts[0]!) as {
      uiTouching: boolean
      matched: unknown[]
      totalChangedFiles: number
      base: string | null
      head: string | null
    }
    assert.equal(verdict.uiTouching, false)
    assert.deepEqual(verdict.matched, [])
    assert.equal(verdict.totalChangedFiles, 3)
    // stdin mode never runs git — base/head are unobserved, never echoed.
    assert.equal(verdict.base, null)
    assert.equal(verdict.head, null)
  })

  it('reports stdin read failure as a stdin error, not a git error', () => {
    const errors: string[] = []
    const result = runClassify(
      { pathsFromStdin: true },
      {
        errorOut: message => errors.push(message),
        readStdin: () => {
          throw new Error('ENXIO: no such device or address')
        },
      }
    )
    assert.equal(result.code, 1)
    assert.match(errors[0]!, /reading paths from stdin failed/)
    assert.doesNotMatch(errors[0]!, /git diff failed/)
  })
})

describe('REP-1646 CLI git mode', () => {
  it('passes base..head to git and classifies its output', () => {
    const jsonOuts: string[] = []
    let receivedArgs: string[] = []
    const result = runClassify(
      { base: 'origin/main', head: 'HEAD' },
      {
        execGit: args => {
          receivedArgs = args
          return 'apps/workspace/src/routes/Sessions.tsx\0'
        },
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    // -z output is NUL-delimited and emitted verbatim — no C-quoting and no
    // newline splitting, so filenames with spaces/newlines survive intact.
    // -z is a diff-subcommand flag, so it sits after `diff`.
    assert.deepEqual(receivedArgs, [
      'diff',
      '-z',
      '--name-only',
      '--no-renames',
      'origin/main..HEAD',
    ])
    const verdict = JSON.parse(jsonOuts[0]!) as {
      uiTouching: boolean
      base: string | null
      head: string | null
    }
    assert.equal(verdict.uiTouching, true)
    assert.equal(verdict.base, 'origin/main')
    assert.equal(verdict.head, 'HEAD') // documented --head default
  })

  it('passes -z and classifies non-ASCII paths verbatim', () => {
    // Without -z, git C-quotes non-ASCII paths (e.g. "caf\303\251.tsx") —
    // no rule regex matches, so real UI files flip to a false non-UI verdict.
    const jsonOuts: string[] = []
    let receivedArgs: string[] = []
    const result = runClassify(
      { base: 'origin/main' },
      {
        execGit: args => {
          receivedArgs = args
          return 'apps/workspace/src/café.tsx\0'
        },
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    // Full argv pin — covers the --head default ('HEAD') too.
    assert.deepEqual(receivedArgs, [
      'diff',
      '-z',
      '--name-only',
      '--no-renames',
      'origin/main..HEAD',
    ])
    const verdict = JSON.parse(jsonOuts[0]!) as {
      uiTouching: boolean
      matched: Array<{ path: string; rule: string }>
    }
    // The unquoted path flows through classification unmodified.
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'apps/workspace/src/café.tsx', rule: 'app-ui' },
    ])
  })

  it('splits NUL-separated git output so filenames survive verbatim', () => {
    const jsonOuts: string[] = []
    const result = runClassify(
      { base: 'origin/main' },
      {
        execGit: () =>
          'apps/workspace/src/routes/Sessions.tsx\0apps/workspace/src/with space.tsx\0',
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    const verdict = JSON.parse(jsonOuts[0]!) as {
      uiTouching: boolean
      matched: Array<{ path: string; rule: string }>
      totalChangedFiles: number
    }
    assert.equal(verdict.totalChangedFiles, 2)
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'apps/workspace/src/routes/Sessions.tsx', rule: 'app-ui' },
      { path: 'apps/workspace/src/with space.tsx', rule: 'app-ui' },
    ])
  })

  it('errors with exit 1 when git mode has no --base', () => {
    const errors: string[] = []
    const result = runClassify(
      {},
      { errorOut: message => errors.push(message) }
    )
    assert.equal(result.code, 1)
    assert.match(errors[0]!, /--base/)
  })

  it('maps git execution failure to exit 1', () => {
    const errors: string[] = []
    const result = runClassify(
      { base: 'origin/main' },
      {
        errorOut: message => errors.push(message),
        execGit: () => {
          throw new Error('git died')
        },
      }
    )
    assert.equal(result.code, 1)
    assert.match(errors[0]!, /git diff failed/)
  })

  it('classifies a real git diff end-to-end (guards flag placement)', () => {
    // S8: every other git-mode test stubs execGit, so an invalid-argv
    // regression (the round-3 `-z`-before-`diff` placement bug) would pass
    // the suite. This runs the REAL git binary against a self-contained
    // fixture repo. execGit carries cwd explicitly instead of relying on
    // process.chdir (global mutation in a shared test process) — the real
    // argv still reaches the real binary, which is the contract under guard.
    const dir = mkdtempSync(path.join(tmpdir(), 'classify-ui-diff-'))
    try {
      const git = (args: string[]) =>
        execFileSync(
          'git',
          [
            '-c',
            'user.email=fixture@rep',
            '-c',
            'user.name=fixture',
            '-c',
            'commit.gpgsign=false',
            ...args,
          ],
          { cwd: dir, encoding: 'utf8' }
        )
      git(['init', '-q'])
      writeFileSync(path.join(dir, 'README.md'), 'base\n')
      git(['add', 'README.md'])
      git(['commit', '-q', '-m', 'base'])
      const base = git(['rev-parse', 'HEAD']).trim()

      mkdirSync(path.join(dir, 'apps/demo/src'), { recursive: true })
      writeFileSync(
        path.join(dir, 'apps/demo/src/Sessions.tsx'),
        'export const x = 1\n'
      )
      writeFileSync(path.join(dir, 'notes.md'), 'changed\n')
      git(['add', '-A'])
      git(['commit', '-q', '-m', 'ui'])

      const jsonOuts: string[] = []
      const result = runClassify(
        { base },
        {
          execGit: args =>
            execFileSync('git', args, { cwd: dir, encoding: 'utf8' }),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 0)
      const verdict = JSON.parse(jsonOuts[0]!) as {
        uiTouching: boolean
        matched: Array<{ path: string; rule: string }>
        totalChangedFiles: number
        base: string | null
        head: string | null
      }
      assert.equal(verdict.uiTouching, true)
      assert.deepEqual(verdict.matched, [
        { path: 'apps/demo/src/Sessions.tsx', rule: 'app-ui' },
      ])
      assert.equal(verdict.totalChangedFiles, 2)
      assert.equal(verdict.base, base)
      assert.equal(verdict.head, 'HEAD')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not reclassify an unchanged audited UI path across divergent history', () => {
    const repoTmp = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../tmp'
    )
    const dir = mkdtempSync(path.join(repoTmp, 'classify-ui-rebase-'))
    try {
      const git = (args: string[]) =>
        execFileSync(
          'git',
          [
            '-c',
            'user.email=fixture@rep',
            '-c',
            'user.name=fixture',
            '-c',
            'commit.gpgsign=false',
            ...args,
          ],
          { cwd: dir, encoding: 'utf8' }
        )
      git(['init', '-q'])
      writeFileSync(path.join(dir, 'README.md'), 'base\n')
      git(['add', 'README.md'])
      git(['commit', '-q', '-m', 'base'])
      const base = git(['rev-parse', 'HEAD']).trim()

      const uiPath = 'apps/demo/src/Sessions.tsx'
      const uiContent = 'export const audited = true\n'
      mkdirSync(path.dirname(path.join(dir, uiPath)), { recursive: true })
      writeFileSync(path.join(dir, uiPath), uiContent)
      git(['add', uiPath])
      git(['commit', '-q', '-m', 'audit UI surface'])
      const checkpoint = git(['rev-parse', 'HEAD']).trim()

      git(['checkout', '-q', '-b', 'rebased-head', base])
      writeFileSync(path.join(dir, 'README.md'), 'upstream change\n')
      mkdirSync(path.dirname(path.join(dir, uiPath)), { recursive: true })
      writeFileSync(path.join(dir, uiPath), uiContent)
      git(['add', '-A'])
      git(['commit', '-q', '-m', 'rebased UI surface'])
      const head = git(['rev-parse', 'HEAD']).trim()
      assert.equal(git(['merge-base', checkpoint, head]).trim(), base)
      assert.equal(git(['show', `${checkpoint}:${uiPath}`]), uiContent)
      assert.equal(git(['show', `${head}:${uiPath}`]), uiContent)

      const jsonOuts: string[] = []
      const result = runClassify(
        { base: checkpoint, head },
        {
          execGit: args =>
            execFileSync('git', args, { cwd: dir, encoding: 'utf8' }),
          jsonOut: json => jsonOuts.push(json),
        }
      )
      assert.equal(result.code, 0)
      const verdict = JSON.parse(jsonOuts[0]!) as {
        uiTouching: boolean
        matched: Array<{ path: string; rule: string }>
        totalChangedFiles: number
      }
      assert.equal(verdict.uiTouching, false)
      assert.deepEqual(verdict.matched, [])
      assert.equal(verdict.totalChangedFiles, 1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
