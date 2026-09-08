/**
 * REP-1648 static Storybook serving: configuration and behavior tests for
 * scripts/storybook-gates.sh.
 *
 * The wrapper must serve the PREBUILT apps/storybook-ui/storybook-static
 * output with a plain static HTTP server (python3 -m http.server) instead of
 * booting the Vite dev server: the test-runner loses its one-shot setup-page
 * script when Vite re-optimizes/reloads mid-run (upstream issue #68), which
 * flaked CI run 34275653377 with `ReferenceError: __test is not defined`
 * (30 failed Select stories, 318/348 passed).
 *
 * Covered here:
 * - the boot command is the static server pointed at storybook-static and no
 *   `pnpm storybook` dev boot remains;
 * - a missing or incomplete storybook-static bundle fails closed BEFORE any
 *   server boot, with a "build repro/storybook-ui first" message (behavior
 *   test against a fixture copy of the script);
 * - the REPRO_STORYBOOK_URL reuse path, readiness poll, cleanup, and both
 *   gates (test-runner + docs-pages) are preserved.
 *
 * Run:
 *   node --test scripts/storybook-gates-wrapper.test.ts
 */

import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const scriptPath = path.join(repoRoot, 'scripts', 'storybook-gates.sh')
const scriptSource = fs.readFileSync(scriptPath, 'utf8')

const fixtureRoots: string[] = []

after(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * Build a checkout the script can run against: the script derives REPO_ROOT
 * from its own location, so a byte-identical copy under
 * <fixture>/scripts/ makes the fixture the repo root without any flag.
 */
function makeFixtureRoot(): string {
  const root = path.join(
    repoRoot,
    'tmp',
    `storybook-gates-fixture-${process.pid}-${fixtureRoots.length}`
  )
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'apps', 'storybook-ui'), { recursive: true })
  fs.copyFileSync(scriptPath, path.join(root, 'scripts', 'storybook-gates.sh'))
  fixtureRoots.push(root)
  return root
}

interface ScriptResult {
  code: number
  stdout: string
  stderr: string
}

/** Run the fixture copy WITHOUT REPRO_STORYBOOK_URL (own boot path). */
function runFixture(fixtureRoot: string): Promise<ScriptResult> {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.REPRO_STORYBOOK_URL

  return new Promise(resolve => {
    execFile(
      'bash',
      [path.join(fixtureRoot, 'scripts', 'storybook-gates.sh')],
      {
        cwd: repoRoot,
        env,
        timeout: 60_000,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as NodeJS.ErrnoException).code === 'number'
            ? ((error as NodeJS.ErrnoException).code as number)
            : error
            ? 1
            : 0
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' })
      }
    )
  })
}

describe('storybook-gates.sh static serving source pins (REP-1648)', () => {
  it('serves the prebuilt storybook-static bundle with a static HTTP server', () => {
    assert.match(
      scriptSource,
      /STORYBOOK_STATIC_DIR="\$STORYBOOK_PKG\/storybook-static"/,
      'the served directory must be the prebuilt storybook-static output'
    )
    assert.match(
      scriptSource,
      /python3 -m http\.server "\$STORYBOOK_PORT" --bind 127\.0\.0\.1 --directory "\$STORYBOOK_STATIC_DIR"/,
      'the boot command must be the static server pointed at storybook-static'
    )
    assert.doesNotMatch(
      scriptSource,
      /pnpm storybook/,
      'the Vite dev-server boot must be gone entirely — driving it is the upstream test-runner injection race (#68)'
    )
  })

  it('documents the upstream injection race the static serving avoids', () => {
    assert.match(
      scriptSource,
      /__test is not defined/,
      'the header must record the observed failure (`ReferenceError: __test is not defined`, CI run 34275653377) so the rationale survives'
    )
  })

  it('requires the capture routes in the prebuilt bundle', () => {
    assert.match(
      scriptSource,
      /for required_file in index\.html iframe\.html index\.json/,
      'the bundle check must require /, /iframe.html and /index.json — the test-runner and docs gate drive them'
    )
    assert.match(
      scriptSource,
      /command -v python3/,
      'the wrapper must fail clearly when python3 is unavailable'
    )
  })

  it('keeps the REPRO_STORYBOOK_URL reuse path with its readiness poll', () => {
    assert.match(
      scriptSource,
      /if \[ -n "\$\{REPRO_STORYBOOK_URL:-\}" \]; then/,
      'reuse must stay opt-in and checked first'
    )
    assert.match(
      scriptSource,
      /Error: REPRO_STORYBOOK_URL did not respond within \$\{MAX_WAIT\}s/,
      'the reuse path must keep its bounded readiness poll'
    )
  })

  it('keeps the test-runner and docs-pages gates against the served URL', () => {
    assert.match(
      scriptSource,
      /pnpm exec test-storybook --url "\$STORYBOOK_URL" --index-json/,
      'gate 1 must keep running the test-runner against the served URL'
    )
    assert.match(
      scriptSource,
      /pnpm exec playwright test --project=docs-pages/,
      'gate 2 must keep running the docs-pages project against the served URL'
    )
  })

  it('still cleans up the booted server process', () => {
    assert.match(
      scriptSource,
      /kill "\$STORYBOOK_PID" 2>\/dev\/null \|\| true/,
      'cleanup must kill the booted server PID'
    )
  })
})

describe('storybook-gates.sh static bundle fail-closed behavior (REP-1648)', () => {
  it('fails closed with a build-first message when the prebuilt bundle is missing', async () => {
    const fixtureRoot = makeFixtureRoot()

    const result = await runFixture(fixtureRoot)

    assert.equal(
      result.code,
      1,
      'a missing storybook-static bundle must fail closed before any server boot or gate run'
    )
    assert.match(
      result.stderr,
      /prebuilt Storybook bundle not found: .*storybook-static/,
      'the failure must name the missing directory'
    )
    assert.match(
      result.stderr,
      /moon run repro\/storybook-ui:build/,
      'the failure must tell the caller how to produce the bundle'
    )
    assert.equal(
      result.stdout,
      '',
      'no gate output may be emitted — the run must stop before the gates'
    )
  })

  it('fails closed when the prebuilt bundle is incomplete', async () => {
    const fixtureRoot = makeFixtureRoot()
    const staticDir = path.join(
      fixtureRoot,
      'apps',
      'storybook-ui',
      'storybook-static'
    )
    fs.mkdirSync(staticDir, { recursive: true })
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>')
    // iframe.html and index.json intentionally missing.

    const result = await runFixture(fixtureRoot)

    assert.equal(
      result.code,
      1,
      'an incomplete storybook-static bundle must fail closed'
    )
    assert.match(
      result.stderr,
      /is incomplete: .*iframe\.html is missing/,
      'the failure must name the missing route file'
    )
    assert.match(
      result.stderr,
      /Rebuild it with: moon run repro\/storybook-ui:build/
    )
  })
})

describe('storybook-gates.sh shell syntax (REP-1648)', () => {
  it('passes `bash -n` validation', () => {
    assert.doesNotThrow(
      () => execFileSync('bash', ['-n', scriptPath], { encoding: 'utf8' }),
      'storybook-gates.sh must remain valid bash 3.2'
    )
  })
})
