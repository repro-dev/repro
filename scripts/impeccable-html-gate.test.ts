// REP-1650: storybook-html gate — the CI detector must execute DOM/geometry
// rules, which only run on .html files. These tests pin the two halves of the
// pipeline:
//
//   1. The render harness (`pnpm run render-stories-html`) produces one static
//      HTML doc per rendered workspace story plus a manifest with rendered /
//      failed counts.
//   2. The impeccable detector's static-html engine flags a planted
//      nested-cards violation and stays silent on a clean page — proving the
//      DOM rule family actually executes (issue AC: "before/after finding on a
//      planted violation").
//
// The detector is invoked through the npm-installed `impeccable` CLI (the same
// binary the CI step resolves via `npx impeccable`). The bundled
// .opencode/skills/impeccable/scripts/detect.mjs is NOT used here: in this
// repo its static-html engine silently falls back to the regex engine because
// htmlparser2 is not resolvable from its path, which would make these
// assertions vacuous. `--no-config` keeps repo-level ignoreFiles from masking
// the planted fixture. Exit codes: 0 clean, 2 findings.
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildWaiverDirective } from './story-waiver-directive.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const HTML_DIR = path.join(repoRoot, 'tmp', 'storybook-html')
const MANIFEST_PATH = path.join(HTML_DIR, 'manifest.json')
const NESTED_CARDS_FIXTURE = path.join(
  repoRoot,
  'tmp',
  'impeccable-html-gate-fixture.html'
)
const CLEAN_FIXTURE = path.join(
  repoRoot,
  'tmp',
  'impeccable-html-gate-clean-fixture.html'
)

// Planted violation: a card div nested inside another card div. Both cards
// carry inline <style> CSS so the static-html engine computes real card-like
// styles (box-shadow + radius + background) — the pattern checkPageLayout's
// isCardLike requires before flagging `nested-cards`.
const NESTED_CARDS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      .card {
        background-color: #ffffff;
        border: 1px solid #e2e2e2;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        padding: 24px;
        width: 420px;
      }
      .inner-card {
        background-color: #fafafa;
        border: 1px solid #dddddd;
        border-radius: 6px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        padding: 16px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <p>Outer card holding quite a lot of body text inside it.</p>
      <div class="inner-card">
        <p>Inner card holding quite a lot of body text inside it.</p>
      </div>
    </div>
  </body>
</html>
`

const CLEAN_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: sans-serif; }
    </style>
  </head>
  <body>
    <p>A simple paragraph page with a short sentence of plain body text.</p>
  </body>
</html>
`

interface DetectorResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Run the impeccable CLI. Findings exit with code 2 (captured off the exec
 * error rather than letting the promise reject); ENOENT-style failures map
 * to code 1 so a missing binary fails the assertions below.
 */
function runDetector(targetPath: string): Promise<DetectorResult> {
  return new Promise(resolve => {
    execFile(
      'pnpm',
      ['exec', 'impeccable', 'detect', targetPath, '--json', '--no-config'],
      { cwd: repoRoot, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException).code === 'number'
            ? ((err as NodeJS.ErrnoException).code as number)
            : err
            ? 1
            : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      }
    )
  })
}

function writeFixture(filePath: string, html: string): void {
  writeFileSync(filePath, html)
}

describe('REP-1650 impeccable static-html gate (planted violation)', () => {
  it('flags a planted nested-cards violation — the DOM rule family executes', async () => {
    writeFixture(NESTED_CARDS_FIXTURE, NESTED_CARDS_HTML)
    const { code, stdout, stderr } = await runDetector(NESTED_CARDS_FIXTURE)
    // Findings exist (exit 2), and stdout carries parseable JSON findings.
    assert.equal(code, 2, `expected exit 2 (findings), got ${code}: ${stderr}`)
    const findings = JSON.parse(stdout) as Array<Record<string, unknown>>
    const nestedCards = findings.filter(
      finding => finding.antipattern === 'nested-cards'
    )
    assert.equal(
      nestedCards.length,
      1,
      `expected exactly one nested-cards finding, got: ${stdout.slice(0, 600)}`
    )
    const finding = nestedCards[0] as Record<string, unknown>
    assert.equal(finding.file, NESTED_CARDS_FIXTURE)
    assert.match(String(finding.snippet), /Card inside card/)
  })

  it('reports no findings on a clean page', async () => {
    writeFixture(CLEAN_FIXTURE, CLEAN_HTML)
    const { code, stdout, stderr } = await runDetector(CLEAN_FIXTURE)
    assert.equal(code, 0, `expected exit 0 (clean), got ${code}: ${stderr}`)
    const findings = JSON.parse(stdout) as Array<Record<string, unknown>>
    assert.deepEqual(findings, [])
  })
})

describe('REP-1650 story->HTML render harness', () => {
  it('renders workspace stories to static HTML with a rendered/failed manifest', () => {
    // Run the harness on demand so the test is self-sufficient locally; CI
    // runs `pnpm run render-stories-html` as its own step before the detect
    // step, so the manifest already exists there.
    if (!existsSync(MANIFEST_PATH)) {
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

    assert.ok(existsSync(MANIFEST_PATH), 'manifest.json was not produced')
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      rendered: number
      failed: number
      failures: Array<{ file: string; story: string; error: string }>
    }
    assert.ok(
      manifest.rendered > 0,
      'expected > 0 rendered stories (silent no-op harness)'
    )
    assert.ok(
      manifest.failed <= manifest.rendered,
      `majority-failure (${manifest.failed} failed vs ${manifest.rendered} rendered) means the harness is broken`
    )
    assert.ok(Array.isArray(manifest.failures))

    // One full HTML doc per rendered story: doctype + captured <style>.
    const htmlFiles = existsSync(HTML_DIR)
      ? readdirSync(HTML_DIR).filter(file => file.endsWith('.html'))
      : []
    assert.equal(
      htmlFiles.length,
      manifest.rendered,
      'expected one HTML doc per rendered story'
    )
    for (const file of htmlFiles.slice(0, 5)) {
      const html = readFileSync(path.join(HTML_DIR, file), 'utf8')
      assert.ok(html.startsWith('<!doctype html>'), `${file} lacks doctype`)
      assert.ok(html.includes('<style>'), `${file} lacks captured CSS`)
    }
    // Cleanup so the next fresh run exercises the harness again.
    rmSync(MANIFEST_PATH)
  })
})

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
