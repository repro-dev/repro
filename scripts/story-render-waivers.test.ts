// REP-1656/REP-1658 story-render waiver + base-rule tests, split out of
// scripts/impeccable-html-gate.test.ts to keep each node:test file under the
// 500-line hang/error band (build-and-test convention). The detector/gate
// fixture tests stay in the parent file; everything here covers the render
// harness's two injection mechanisms:
//
//   1. Story-level `parameters.impeccable` waivers → whole-file
//      `impeccable-disable` directives (REP-1656).
//   2. The explicit `body{font-size}` base rule on every rendered doc
//      (REP-1658) — see scripts/story-html-document.ts.
//
// Both mechanisms are source-level claims that only become real after a
// re-render: source inline ignores cannot survive re-render (the detector
// scans tmp/storybook-html/), so each integration test renders on demand and
// re-checks the regenerated doc.
//
// Serialization contract (REP-1658 review): this file renders tmp/storybook-html
// on demand (writeFileSync, non-atomic). `test:tooling-config` therefore runs
// it in a dedicated `--test-concurrency=1` invocation so sibling render-on-demand
// files cannot race it mid-rewrite on cold state — pinned by the REP-1658
// serialization test in scripts/tooling-config.test.ts.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fontSize } from '../packages/design/src/tokens/typography.ts'
import { htmlDocument } from './story-html-document.ts'
import { buildWaiverDirective } from './story-waiver-directive.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const HTML_DIR = path.join(repoRoot, 'tmp', 'storybook-html')
const MANIFEST_PATH = path.join(HTML_DIR, 'manifest.json')

describe('REP-1656 story-parameter waiver directives', () => {
  // Source-level inline ignores cannot survive re-render: the detector scans
  // the generated HTML, not the story source. Stories declare
  // `parameters.impeccable = { disable, reason }` instead, and the harness
  // injects the whole-file `impeccable-disable` directive the static-html
  // engine honors into every rendered doc.
  it('builds a whole-file impeccable-disable directive from story parameters', () => {
    const noParams = buildWaiverDirective({ name: 'story' })
    assert.equal(noParams, '')

    const emptyDisable = buildWaiverDirective({
      parameters: { impeccable: { disable: [], reason: 'nothing to waive' } },
    })
    assert.equal(emptyDisable, '')

    const single = buildWaiverDirective({
      parameters: {
        impeccable: {
          disable: ['cramped-padding'],
          reason: 'edge-to-edge component anatomy',
        },
      },
    })
    assert.equal(
      single,
      '<!-- impeccable-disable cramped-padding -- edge-to-edge component anatomy -->'
    )

    const multiple = buildWaiverDirective({
      parameters: {
        impeccable: {
          disable: ['cramped-padding', 'numbered-section-markers'],
        },
      },
    })
    assert.equal(
      multiple,
      '<!-- impeccable-disable cramped-padding, numbered-section-markers -->'
    )

    // Unknown-safe: non-string and empty rule entries are dropped.
    const filtered = buildWaiverDirective({
      parameters: {
        impeccable: { disable: ['cramped-padding', 42, null, ''] },
      },
    })
    assert.equal(filtered, '<!-- impeccable-disable cramped-padding -->')
  })

  it('injects waiver directives from a workspace story into its rendered HTML', async () => {
    // The Accordion SingleExpand story declares parameters.impeccable with a
    // cramped-padding waiver; its rendered doc must carry the directive so the
    // waiver survives any re-render by construction.
    const targetFile = path.join(
      HTML_DIR,
      'packages-design-src-Accordion-Accordion-SingleExpand.html'
    )

    const hasDirective = (): boolean =>
      existsSync(targetFile) &&
      readFileSync(targetFile, 'utf8').includes(
        '<!-- impeccable-disable cramped-padding'
      )

    if (!hasDirective()) {
      // Stale or missing render output: re-render so the assertion reflects
      // the current harness. A broken mechanism still fails below — a fresh
      // render without injection never gains the directive.
      try {
        execFileSync('pnpm', ['run', 'render-stories-html'], {
          cwd: repoRoot,
          timeout: 600_000,
          maxBuffer: 32 * 1024 * 1024,
        })
      } catch (err) {
        const failure = err as { stdout?: string; stderr?: string }
        assert.fail(
          `render-stories-html failed: ${failure.stdout ?? ''}\n${
            failure.stderr ?? String(err)
          }`
        )
      }
    }

    assert.ok(
      hasDirective(),
      `expected the injected waiver directive in ${targetFile}`
    )
    // Preserve the existing cleanup invariant: the next fresh run exercises
    // the harness again rather than reading a stale manifest.
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH)
  })
})

describe('REP-1658 render-harness base font-size', () => {
  // The harness sets an explicit body base font-size on every rendered doc
  // (REP-1658 decision 3): without it, unstyled story text computes at the
  // browser-default 16px and injects a phantom entry into every page's
  // computed size set — the ambient condition `flat-type-hierarchy` scored
  // against was never the app's real condition (text is always styled in the
  // app; `fontSize.md` is primary body text). The value must come from the
  // design tokens module — no hardcoded literal.
  it('emits an explicit body base rule sourced from fontSize.md, after the story CSS', () => {
    const storyCss = '.demo{color:red}'
    const baseRule = `body{font-size:${fontSize.md}px}`
    const doc = htmlDocument('<p>hello</p>', storyCss)
    assert.ok(
      doc.includes(baseRule),
      `expected base rule ${baseRule} in doc: ${doc}`
    )
    // Ordering pin (REP-1658 review): presence alone would stay green if the
    // harness moved the base rule ahead of the story CSS — a story-level body
    // rule would then win the source-order tie and silently override the
    // base. The rule must come AFTER the story CSS (the
    // scripts/story-html-document.ts contract).
    const baseRuleIndex = doc.indexOf(baseRule)
    const storyCssIndex = doc.indexOf(storyCss)
    assert.ok(
      baseRuleIndex > storyCssIndex,
      `base rule must follow the story CSS in source order (story CSS at ` +
        `${storyCssIndex}, base rule at ${baseRuleIndex}): ${doc}`
    )
  })

  it('carries the base rule last in its style element in a rendered story doc', async () => {
    // Same render-if-stale pattern as the waiver-injection test above: a doc
    // rendered by an older harness (no base rule) must fail the check and be
    // regenerated — a fresh render from the current template always gains it.
    const targetFile = path.join(
      HTML_DIR,
      'packages-design-src-Accordion-Accordion-SingleExpand.html'
    )
    const expectedBaseRule = `body{font-size:${fontSize.md}px}`

    const readRenderedDoc = (): string | null => {
      if (!existsSync(targetFile)) return null
      const doc = readFileSync(targetFile, 'utf8')
      return doc.includes(expectedBaseRule) ? doc : null
    }

    let doc = readRenderedDoc()
    if (doc === null) {
      try {
        execFileSync('pnpm', ['run', 'render-stories-html'], {
          cwd: repoRoot,
          timeout: 600_000,
          maxBuffer: 32 * 1024 * 1024,
        })
      } catch (err) {
        const failure = err as { stdout?: string; stderr?: string }
        assert.fail(
          `render-stories-html failed: ${failure.stdout ?? ''}\n${
            failure.stderr ?? String(err)
          }`
        )
      }
      doc = readRenderedDoc()
    }

    assert.ok(
      doc !== null,
      `expected the ${expectedBaseRule} base rule in ${targetFile}`
    )

    // Ordering pin (REP-1658 review): presence alone would stay green if the
    // harness moved the base rule ahead of the story CSS — a story-level body
    // rule would then win the source-order tie and silently override the
    // base. The base rule must END its <style> element (the
    // scripts/story-html-document.ts contract): nothing may follow it before
    // the closing tag.
    const baseRuleIndex = doc.indexOf(expectedBaseRule)
    const styleCloseIndex = doc.indexOf('</style>', baseRuleIndex)
    assert.ok(
      styleCloseIndex >= 0,
      `expected a </style> closing after the base rule in ${targetFile}`
    )
    assert.equal(
      doc
        .slice(baseRuleIndex + expectedBaseRule.length, styleCloseIndex)
        .trim(),
      '',
      `base rule must end its <style> element in ${targetFile} so it wins ` +
        'the source-order tie — a later equal-specificity body rule would ' +
        'override it'
    )
    // Preserve the existing cleanup invariant: the next fresh run exercises
    // the harness again rather than reading a stale manifest.
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH)
  })
})
