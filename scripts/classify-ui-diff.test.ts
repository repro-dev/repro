import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyPaths, parseCliArgs, runClassify } from './classify-ui-diff.ts'

describe('REP-1646 classifyPaths — UI-touching positives', () => {
  it('classifies app route/component tsx as UI-touching', () => {
    for (const p of [
      'apps/workspace/src/routes/Sessions.tsx',
      'apps/admin/src/components/Foo.tsx',
    ]) {
      const verdict = classifyPaths([p])
      assert.equal(verdict.uiTouching, true, p)
      assert.deepEqual(verdict.matched, [{ path: p, rule: 'app-ui' }])
    }
  })

  it('classifies rendered package components as UI-touching', () => {
    const verdict = classifyPaths(['packages/agentic-ui/src/AgenticView.tsx'])
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'packages/agentic-ui/src/AgenticView.tsx', rule: 'package-ui' },
    ])
  })

  it('classifies any packages/design file (tokens included) as UI-touching', () => {
    assert.equal(
      classifyPaths(['packages/design/src/tokens/color.ts']).uiTouching,
      true
    )
    assert.equal(
      classifyPaths(['packages/design/src/index.ts']).uiTouching,
      true
    )
  })

  it('classifies storybook files as UI-touching', () => {
    for (const p of [
      'apps/workspace/src/Foo.stories.tsx',
      'packages/design/src/Button.stories.tsx',
    ]) {
      assert.equal(classifyPaths([p]).uiTouching, true, p)
    }
  })

  it('classifies .pen files as UI-touching', () => {
    const verdict = classifyPaths(['repro.pen'])
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'repro.pen', rule: 'pen-design' },
    ])
  })

  it('classifies app/package styles as UI-touching', () => {
    for (const p of [
      'apps/workspace/src/styles/foo.css',
      'apps/workspace/src/styles/foo.scss',
    ]) {
      const verdict = classifyPaths([p])
      assert.equal(verdict.uiTouching, true, p)
      assert.deepEqual(verdict.matched, [{ path: p, rule: 'styles' }])
    }
  })

  it('attributes design css to design-package (first matching rule)', () => {
    // packages/design css matches both design-package and styles; the
    // earlier design-package rule wins attribution — UI-touching either way.
    const verdict = classifyPaths(['packages/design/src/styles/foo.css'])
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'packages/design/src/styles/foo.css', rule: 'design-package' },
    ])
  })
})

describe('REP-1646 classifyPaths — non-UI negatives', () => {
  it('classifies pure logic, docs, config, and workflow paths as non-UI', () => {
    const verdict = classifyPaths([
      'packages/buffer-utils/src/ring.ts',
      'packages/recording/src/observer.ts',
      '.opencode/skills/delivery-workflow/SKILL.md',
      'scripts/pen-lint.ts',
      'package.json',
      'docs/foo.md',
      '.github/workflows/ci.yml',
      'moon.yml',
      'apps/api-server/src/routes/sessions.ts',
    ])
    assert.equal(verdict.uiTouching, false)
    assert.deepEqual(verdict.matched, [])
  })
})

describe('REP-1646 classifyPaths — test-file exclusion', () => {
  it('never classifies test files even when a sibling source would match', () => {
    const verdict = classifyPaths([
      'apps/workspace/src/Foo.test.tsx',
      'packages/design/src/__tests__/Foo.tsx',
      'packages/design/src/Foo.spec.tsx',
      'packages/design/src/tokens.test.ts',
    ])
    assert.equal(verdict.uiTouching, false)
    assert.deepEqual(verdict.matched, [])
  })
})

describe('REP-1646 classifyPaths — edge cases', () => {
  it('returns a non-UI verdict for an empty diff', () => {
    assert.deepEqual(classifyPaths([]), { uiTouching: false, matched: [] })
  })

  it('is conservative on mixed diffs (any UI file flips the verdict)', () => {
    const verdict = classifyPaths([
      'packages/buffer-utils/src/ring.ts',
      'apps/workspace/src/routes/Sessions.tsx',
      'package.json',
    ])
    assert.equal(verdict.uiTouching, true)
    assert.deepEqual(verdict.matched, [
      { path: 'apps/workspace/src/routes/Sessions.tsx', rule: 'app-ui' },
    ])
  })

  it('collapses duplicate paths', () => {
    const verdict = classifyPaths(['repro.pen', 'repro.pen'])
    assert.equal(verdict.matched.length, 1)
  })

  it('preserves input order and attributes the first matching rule', () => {
    const verdict = classifyPaths([
      'packages/design/src/Foo.stories.tsx',
      'repro.pen',
      'apps/workspace/src/routes/Sessions.tsx',
    ])
    assert.deepEqual(
      verdict.matched.map(m => m.path),
      [
        'packages/design/src/Foo.stories.tsx',
        'repro.pen',
        'apps/workspace/src/routes/Sessions.tsx',
      ]
    )
    // packages/design .tsx hits package-ui before the broader design-package rule.
    assert.equal(verdict.matched[0]!.rule, 'package-ui')
  })
})

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
  it('emits the full verdict JSON and exits 0', () => {
    const jsonOuts: string[] = []
    const result = runClassify(
      { pathsFromStdin: true, base: 'origin/main', head: 'HEAD' },
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
    assert.equal(verdict.base, 'origin/main')
    assert.equal(verdict.head, 'HEAD')
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
    }
    assert.equal(verdict.uiTouching, false)
    assert.deepEqual(verdict.matched, [])
    assert.equal(verdict.totalChangedFiles, 3)
  })
})

describe('REP-1646 CLI git mode', () => {
  it('passes base...head to git and classifies its output', () => {
    const jsonOuts: string[] = []
    let receivedArgs: string[] = []
    const result = runClassify(
      { base: 'origin/main', head: 'HEAD' },
      {
        execGit: args => {
          receivedArgs = args
          return 'apps/workspace/src/routes/Sessions.tsx\n'
        },
        jsonOut: json => jsonOuts.push(json),
      }
    )
    assert.equal(result.code, 0)
    assert.deepEqual(receivedArgs, [
      'diff',
      '--name-only',
      '--no-renames',
      'origin/main...HEAD',
    ])
    const verdict = JSON.parse(jsonOuts[0]!) as {
      uiTouching: boolean
      base: string | null
      head: string | null
    }
    assert.equal(verdict.uiTouching, true)
    assert.equal(verdict.base, 'origin/main')
    assert.equal(verdict.head, 'HEAD')
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
})
