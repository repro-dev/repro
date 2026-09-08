/**
 * REP-1648 static Storybook serving: behavior + configuration tests for
 * scripts/visual-regression.sh's own boot path.
 *
 * The wrapper must serve the PREBUILT apps/storybook-ui/storybook-static
 * output with a plain static HTTP server (python3 -m http.server) instead of
 * booting the Vite dev server: the test-runner loses its one-shot setup-page
 * script when Vite re-optimizes/reloads mid-run (upstream issue #68), which
 * flaked CI run 34275653377 with `ReferenceError: __test is not defined`.
 *
 * No browser is launched: the fixture bundle's EMPTY index.json drives the
 * capture script down its zero-story fail-closed path, while proving the
 * static server actually serves /index.json to the capture.
 *
 * Run:
 *   node --test scripts/visual-regression-static.test.ts
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const wrapperPath = path.join(repoRoot, 'scripts', 'visual-regression.sh')

const fixtureRoots: string[] = []

after(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * Build a minimal checkout for the wrapper: the canonical Storybook package
 * location (an empty apps/storybook-ui dir is enough for find_storybook_pkg)
 * plus a copy of the capture script, because the wrapper always invokes
 * $REPO_ROOT/scripts/visual-regression-capture.ts.
 */
function makeFixtureRoot(): string {
  const root = path.join(
    repoRoot,
    'tmp',
    `wrapper-static-fixture-${process.pid}-${fixtureRoots.length}`
  )
  fs.mkdirSync(path.join(root, 'apps', 'storybook-ui'), { recursive: true })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.copyFileSync(
    path.join(repoRoot, 'scripts', 'visual-regression-capture.ts'),
    path.join(root, 'scripts', 'visual-regression-capture.ts')
  )
  fixtureRoots.push(root)
  return root
}

/**
 * Create the minimal prebuilt Storybook bundle the static-serving path
 * requires (index.html + iframe.html + index.json). The EMPTY index drives
 * the capture script down its zero-story fail-closed path — the capture
 * never launches a browser.
 */
function makeStaticBundle(fixtureRoot: string): string {
  const staticDir = path.join(
    fixtureRoot,
    'apps',
    'storybook-ui',
    'storybook-static'
  )
  fs.mkdirSync(staticDir, { recursive: true })
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html>')
  fs.writeFileSync(path.join(staticDir, 'iframe.html'), '<!doctype html>')
  fs.writeFileSync(path.join(staticDir, 'index.json'), '{"entries":{}}')
  return staticDir
}

/**
 * Materialize the default committed-baseline dir with only the tracked
 * `.gitkeep` sentinel — the repo's own pre-baseline state.
 */
function makeSentinelBaselineDir(fixtureRoot: string): string {
  const baselineDir = path.join(fixtureRoot, 'tmp', 'visual-baselines')
  fs.mkdirSync(baselineDir, { recursive: true })
  fs.writeFileSync(path.join(baselineDir, '.gitkeep'), '')
  return baselineDir
}

interface WrapperResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Run the wrapper with NO REPRO_STORYBOOK_URL so it exercises its own boot
 * path (the reuse path is covered by visual-regression-wrapper.test.ts).
 */
function runWrapperBootPath(
  fixtureRoot: string,
  args: string[]
): Promise<WrapperResult> {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.REPRO_STORYBOOK_URL

  return new Promise(resolve => {
    execFile(
      'bash',
      [wrapperPath, '--repo-root', fixtureRoot, ...args],
      {
        cwd: repoRoot,
        env,
        timeout: 120_000,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        // execFile rejects on non-zero exit; the code travels on the error.
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

describe('visual-regression.sh static Storybook serving (REP-1648)', () => {
  it('serves the prebuilt storybook-static bundle over a static HTTP server', async () => {
    const fixtureRoot = makeFixtureRoot()
    makeStaticBundle(fixtureRoot)
    makeSentinelBaselineDir(fixtureRoot)

    const result = await runWrapperBootPath(fixtureRoot, ['--stories', '[]'])

    assert.match(
      result.stderr,
      /Serving prebuilt Storybook static bundle/,
      'the wrapper must serve the prebuilt bundle, not boot the Vite dev server'
    )
    // The static bundle's EMPTY index was served and parsed by the capture
    // script, which fails closed on zero stories (a check that captures
    // nothing is not green).
    assert.equal(result.code, 1)
    const output = JSON.parse(result.stdout) as {
      stories_checked: string[]
      passed: string[]
      failed: string[]
      new_stories: string[]
    }
    assert.deepEqual(output, {
      stories_checked: [],
      passed: [],
      failed: [],
      new_stories: [],
    })
  })

  it('fails closed with a build-first message when the prebuilt bundle is missing', async () => {
    const fixtureRoot = makeFixtureRoot()
    makeSentinelBaselineDir(fixtureRoot)

    const result = await runWrapperBootPath(fixtureRoot, ['--stories', '[]'])

    assert.equal(
      result.code,
      1,
      'a missing storybook-static bundle must fail closed before any server boot'
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
    assert.ok(
      !result.stdout.includes('stories_checked'),
      'no capture JSON may be emitted — the run must stop before capture'
    )
  })

  it('fails closed when the prebuilt bundle is incomplete', async () => {
    const fixtureRoot = makeFixtureRoot()
    const staticDir = makeStaticBundle(fixtureRoot)
    fs.rmSync(path.join(staticDir, 'iframe.html'))
    makeSentinelBaselineDir(fixtureRoot)

    const result = await runWrapperBootPath(fixtureRoot, ['--stories', '[]'])

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

  it('boots python3 http.server on the bundle and requires the capture routes', () => {
    const wrapperSource = fs.readFileSync(wrapperPath, 'utf8')

    assert.match(
      wrapperSource,
      /python3 -m http\.server "\$STORYBOOK_PORT" --bind 127\.0\.0\.1 --directory "\$STORYBOOK_STATIC_DIR"/,
      'the boot command must be the static server pointed at storybook-static'
    )
    assert.doesNotMatch(
      wrapperSource,
      /pnpm storybook/,
      'the Vite dev-server boot must be gone entirely'
    )
    assert.match(
      wrapperSource,
      /for required_file in index\.html iframe\.html index\.json/,
      'the bundle check must require the /, /iframe.html and /index.json routes capture uses'
    )
    assert.match(
      wrapperSource,
      /command -v python3/,
      'the wrapper must fail clearly when python3 is unavailable'
    )
  })
})
