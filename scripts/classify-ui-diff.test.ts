import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyPaths } from './classify-ui-diff.ts'

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
      // Storybook docs entries — the rule honors the issue's literal
      // *.stories.* rather than enumerating extensions.
      'packages/design/src/Button.stories.mdx',
    ]) {
      assert.equal(classifyPaths([p]).uiTouching, true, p)
    }
    const verdict = classifyPaths(['apps/workspace/src/Foo.stories.mdx'])
    assert.deepEqual(verdict.matched, [
      { path: 'apps/workspace/src/Foo.stories.mdx', rule: 'storybook' },
    ])
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
      'packages/agentic-ui/src/foo.css',
      'packages/agentic-ui/src/foo.scss',
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

describe('REP-1646 classifyPaths — html-surface rule', () => {
  it('classifies src-anchored app html hosts as UI-touching', () => {
    // Shipped hosts: apps/capture/src/extension/static/bridgeHost.html,
    // apps/dev-toolbar/src/extension/static/devtools.html.
    for (const p of [
      'apps/capture/src/extension/static/bridgeHost.html',
      'apps/dev-toolbar/src/extension/static/devtools.html',
    ]) {
      const verdict = classifyPaths([p])
      assert.equal(verdict.uiTouching, true, p)
      assert.deepEqual(verdict.matched, [{ path: p, rule: 'html-surface' }])
    }
  })

  it('classifies app-root html hosts as UI-touching', () => {
    // Shipped hosts: apps/workspace/index.html, apps/workspace/apiBridge.html.
    for (const p of [
      'apps/workspace/index.html',
      'apps/workspace/apiBridge.html',
    ]) {
      const verdict = classifyPaths([p])
      assert.equal(verdict.uiTouching, true, p)
      assert.deepEqual(verdict.matched, [{ path: p, rule: 'html-surface' }])
    }
  })

  it('never classifies html outside app roots', () => {
    const verdict = classifyPaths(['docs/foo.html'])
    assert.equal(verdict.uiTouching, false)
    assert.deepEqual(verdict.matched, [])
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
