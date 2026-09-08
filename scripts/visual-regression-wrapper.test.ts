/**
 * Behavior tests for scripts/visual-regression.sh (REP-1648 review fix 7):
 *
 * - a missing baseline directory fails closed with an actionable error,
 *   BEFORE any capture runs;
 * - a baseline directory holding only the tracked `.gitkeep` sentinel does
 *   not hard-fail — it is treated as "no baselines yet" (all stories new)
 *   and the run proceeds to the capture script;
 * - the fail-closed exit of the capture script (zero-story index) propagates
 *   through the wrapper's JSON-stdout contract.
 *
 * No browser and no real Storybook: the wrapper reuses a tiny local HTTP
 * server via REPRO_STORYBOOK_URL, and the capture script exits 1 on the
 * empty index without ever launching Playwright. The fixture checkout lives
 * under tmp/ (git-ignored) and is removed after the run.
 *
 * Run:
 *   node --test scripts/visual-regression-wrapper.test.ts
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import * as path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const wrapperPath = path.join(repoRoot, 'scripts', 'visual-regression.sh')

const fixtureRoots: string[] = []
const servers: Server[] = []

after(() => {
  for (const server of servers) {
    server.close()
  }
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * Boot a fake Storybook: responds 200 to everything, with an EMPTY index —
 * enough for the wrapper's readiness poll, and it drives the capture script
 * down its zero-story fail-closed path without launching a browser.
 */
function startFakeStorybook(): Promise<string> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        req.url?.includes('index.json') ? '{"entries":{}}' : '{"ok":true}'
      )
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

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
    `wrapper-fixture-${process.pid}-${fixtureRoots.length}`
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

interface WrapperResult {
  code: number
  stdout: string
  stderr: string
}

/** Run the wrapper with REPRO_STORYBOOK_URL pointed at the fake server. */
function runWrapper(
  fixtureRoot: string,
  args: string[],
  storybookUrl: string
): Promise<WrapperResult> {
  return new Promise(resolve => {
    execFile(
      'bash',
      [wrapperPath, '--repo-root', fixtureRoot, ...args],
      {
        cwd: repoRoot,
        env: { ...process.env, REPRO_STORYBOOK_URL: storybookUrl },
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

describe('visual-regression.sh baseline-directory behavior (REP-1648)', () => {
  it('fails closed with an actionable error when the baseline directory is missing', async () => {
    const storybookUrl = await startFakeStorybook()
    const fixtureRoot = makeFixtureRoot()
    // Explicitly point --baseline-dir at a path that does not exist: a bad
    // override or a broken checkout must exit 1 before any capture runs.
    const baselineDir = path.join(fixtureRoot, 'tmp', 'visual-baselines')

    const result = await runWrapper(
      fixtureRoot,
      ['--baseline-dir', baselineDir, '--stories', '[]'],
      storybookUrl
    )

    assert.equal(
      result.code,
      1,
      'a missing baseline directory must fail closed'
    )
    assert.match(
      result.stderr,
      /baseline directory does not exist/,
      'the error must name the missing baseline directory'
    )
    assert.match(result.stderr, /docs\/visual-regression\.md/)
    assert.ok(
      !result.stdout.includes('stories_checked'),
      'no capture JSON may be emitted — the run must stop before the capture script'
    )
  })

  it('treats a .gitkeep-only baseline dir as no-baselines and fails closed on the empty index', async () => {
    const storybookUrl = await startFakeStorybook()
    const fixtureRoot = makeFixtureRoot()
    // The default (committed) baseline dir exists but holds only the tracked
    // .gitkeep sentinel — not a baseline. The wrapper must NOT hard-fail;
    // it proceeds and reports all stories as new.
    const baselineDir = path.join(fixtureRoot, 'tmp', 'visual-baselines')
    fs.mkdirSync(baselineDir, { recursive: true })
    fs.writeFileSync(path.join(baselineDir, '.gitkeep'), '')

    const result = await runWrapper(
      fixtureRoot,
      ['--stories', '[]'],
      storybookUrl
    )

    assert.doesNotMatch(
      result.stderr,
      /baseline directory does not exist/,
      'the .gitkeep sentinel must not read as a broken checkout'
    )
    assert.match(
      result.stderr,
      new RegExp(
        `No baselines found in ${baselineDir.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )} `
      ),
      'the fixture checkout must diff against ITS OWN baseline dir — the default baseline dir must follow --repo-root, not stay pinned to the original checkout'
    )

    // The fake index has zero stories, so the capture script fails closed
    // and the wrapper must propagate that exit code with its JSON contract.
    assert.equal(
      result.code,
      1,
      'a zero-story check set must propagate as a failure — a gate that checked nothing is not green'
    )
    const output = JSON.parse(result.stdout) as {
      stories_checked: string[]
      passed: string[]
      failed: unknown[]
      new_stories: string[]
    }
    assert.deepEqual(output, {
      stories_checked: [],
      passed: [],
      failed: [],
      new_stories: [],
    })

    if (process.platform === 'darwin') {
      assert.match(
        result.stderr,
        /baselines are generated on Linux/,
        'diff mode on macOS must warn about Linux-generated baselines (platform drift)'
      )
    }
  })
})

describe('visual-regression.sh fail-closed behavior (review pass 2, REP-1648)', () => {
  it('fails closed with exit 1 when no Storybook package exists', async () => {
    // A bare checkout: no apps/storybook-ui and no .storybook/ dir anywhere.
    const bareRoot = path.join(
      repoRoot,
      'tmp',
      `wrapper-bare-${process.pid}-${fixtureRoots.length}`
    )
    fs.mkdirSync(path.join(bareRoot, 'scripts'), { recursive: true })
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', 'visual-regression-capture.ts'),
      path.join(bareRoot, 'scripts', 'visual-regression-capture.ts')
    )
    fixtureRoots.push(bareRoot)

    // The URL is never reached — the wrapper must fail before any reuse.
    const result = await runWrapper(
      bareRoot,
      ['--stories', '[]'],
      'http://127.0.0.1:1'
    )

    assert.equal(
      result.code,
      1,
      'a checkout with no Storybook package must fail closed — a visual gate that checked nothing is not green'
    )
    assert.match(
      result.stderr,
      /no Storybook package found/i,
      'the failure must say why it failed'
    )
    const output = JSON.parse(result.stdout) as {
      stories_checked: string[]
      passed: string[]
      failed: string[]
      new_stories: string[]
      error: string
    }
    assert.deepEqual(
      {
        stories_checked: output.stories_checked,
        passed: output.passed,
        failed: output.failed,
        new_stories: output.new_stories,
      },
      { stories_checked: [], passed: [], failed: [], new_stories: [] }
    )
    assert.match(
      output.error,
      /No Storybook setup found .* visual gate failed closed/
    )
  })

  it('rejects an invalid --threshold before booting anything', async () => {
    const storybookUrl = await startFakeStorybook()
    const fixtureRoot = makeFixtureRoot()

    for (const invalid of ['banana', '1.5', '-0.1', 'NaN']) {
      const result = await runWrapper(
        fixtureRoot,
        ['--threshold', invalid, '--stories', '[]'],
        storybookUrl
      )

      assert.equal(
        result.code,
        1,
        `threshold "${invalid}" must fail the wrapper`
      )
      assert.match(
        result.stderr,
        /\[visual-regression\] Error: --threshold .* must be a finite number between 0 and 1/,
        `threshold "${invalid}" must be rejected by the WRAPPER (tagged error) before any server boot or capture run`
      )
      assert.match(
        result.stderr,
        /docs\/visual-regression\.md/,
        'the wrapper rejection must point at the docs'
      )
      assert.ok(
        !result.stdout.includes('stories_checked'),
        'no capture JSON may be emitted for an invalid threshold'
      )
    }
  })

  it('rejects an invalid per-package .visual-threshold override', async () => {
    const storybookUrl = await startFakeStorybook()
    const fixtureRoot = makeFixtureRoot()
    fs.writeFileSync(
      path.join(fixtureRoot, 'apps', 'storybook-ui', '.visual-threshold'),
      'oops'
    )

    const result = await runWrapper(
      fixtureRoot,
      ['--stories', '[]'],
      storybookUrl
    )

    assert.equal(
      result.code,
      1,
      'a junk .visual-threshold file must fail the wrapper'
    )
    assert.match(
      result.stderr,
      /\[visual-regression\] Error: --threshold .* must be a finite number between 0 and 1/,
      'the .visual-threshold override must be validated by the wrapper'
    )
  })
})

describe('visual-regression.sh capture-arg passing (review pass 2, REP-1648)', () => {
  const wrapperSource = fs.readFileSync(wrapperPath, 'utf8')

  it('passes capture args through a quoted Bash 3.2 indexed array', () => {
    assert.match(
      wrapperSource,
      /CAPTURE_ARGS=\(/,
      'capture args must be assigned as a Bash 3.2-compatible indexed array'
    )
    assert.match(
      wrapperSource,
      /"\$\{CAPTURE_ARGS\[@\]\}"/,
      'capture args must expand as a quoted array'
    )
  })

  it('quotes the JSON --stories payload so word splitting cannot break it', () => {
    assert.match(
      wrapperSource,
      /--stories "\$STORIES"/,
      'the JSON stories payload must be quoted'
    )
    assert.doesNotMatch(
      wrapperSource,
      /(?<!\{)\$CAPTURE_ARGS/,
      'no unquoted $CAPTURE_ARGS word splitting may remain'
    )
  })

  it('drops the obsolete SC2086 word-split suppression', () => {
    assert.doesNotMatch(
      wrapperSource,
      /SC2086/,
      'quoted array expansion makes the SC2086 suppression obsolete'
    )
  })
})
