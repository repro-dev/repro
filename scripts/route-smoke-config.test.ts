/**
 * Config/behavior tests for scripts/route-smoke.sh (REP-1648 review pass 2):
 *
 * - the admin port picker must never select the workspace's picked port —
 *   when the workspace preferred port was occupied and auto-incremented
 *   onto the admin preferred port, BOTH pickers resolve before either
 *   server binds, so without an exclusion both would pick the same port and
 *   the second `serve` would fail to bind (or cross-serve);
 * - the find-free-port failure paths must reference the RESOLVED preferred
 *   port values (the raw SMOKE_* variables are unset when defaulted, and a
 *   `set -u` reference in an error path masks the real error).
 *
 * `find_free_port` is extracted from the script and run under bash with a
 * fake `lsof` on PATH so occupied/free ports are fully scripted — no real
 * network, no built dists, no Playwright.
 *
 * Run:
 *   node --test scripts/route-smoke-config.test.ts
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
const scriptPath = path.join(repoRoot, 'scripts', 'route-smoke.sh')
const scriptSource = fs.readFileSync(scriptPath, 'utf8')

/** Extract a top-level bash function's source text (name() { … }) by line. */
function extractFunction(name: string): string {
  const lines = scriptSource.split('\n')
  const start = lines.findIndex(line => line === `${name}() {`)
  assert.ok(start >= 0, `route-smoke.sh must define ${name}()`)

  const end = lines.findIndex((line, index) => index > start && line === '}')
  assert.ok(end > start, `${name}() must be a closed top-level function`)

  return lines.slice(start, end + 1).join('\n')
}

const scratchDirs: string[] = []

/**
 * Scratch dir under the repo-root tmp/ (AGENTS.md invariant — never /tmp).
 * The fake-lsof dir is registered for the after() sweep so a crashed
 * execFile cannot leak it; the happy path still removes it inline.
 */
function makeScratchDir(prefix: string): string {
  const dir = fs.mkdtempSync(
    path.join(repoRoot, 'tmp', `${prefix}-${process.pid}-`)
  )
  scratchDirs.push(dir)
  return dir
}

after(() => {
  for (const dir of scratchDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

interface BashResult {
  code: number
  stdout: string
  stderr: string
}

/** Run a snippet with the extracted function and a fake lsof on PATH. */
async function runWithFakeLsof(
  snippet: string,
  occupiedPorts: string[]
): Promise<BashResult> {
  const tmpDir = makeScratchDir('route-smoke-test')
  const fakeLsof = path.join(tmpDir, 'lsof')
  // Fake lsof semantics for the picker's check form
  // (`lsof -iTCP:<port> -sTCP:LISTEN -t`): exit 0 = listeners found (port
  // occupied), exit 1 = free.
  fs.writeFileSync(
    fakeLsof,
    [
      '#!/bin/sh',
      'port=""',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    -iTCP:*) port="${arg#-iTCP:}" ;;',
      '  esac',
      'done',
      'case " $FAKE_OCCUPIED_PORTS " in',
      '  *" $port "*) exit 0 ;;',
      'esac',
      'exit 1',
      '',
    ].join('\n')
  )
  fs.chmodSync(fakeLsof, 0o755)

  return new Promise(resolve => {
    execFile(
      'bash',
      ['-c', `${extractFunction('find_free_port')}\n${snippet}`],
      {
        cwd: tmpDir,
        env: {
          ...process.env,
          PATH: `${tmpDir}:${process.env.PATH ?? ''}`,
          FAKE_OCCUPIED_PORTS: occupiedPorts.join(' '),
        },
        timeout: 30_000,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
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

describe('route-smoke find_free_port port exclusion (REP-1648)', () => {
  it('never returns the excluded port, even when it is free', async () => {
    // Workspace picked 7081 (7080 was occupied); the admin picker must skip
    // 7081 even though nothing is bound yet — the bind happens later.
    const result = await runWithFakeLsof(
      'find_free_port 7081 7081; echo "exit:$?"',
      []
    )

    assert.equal(result.stdout.trim(), '7082\nexit:0')
  })

  it('picks the preferred port when no port is excluded', async () => {
    const result = await runWithFakeLsof(
      'find_free_port 7080 ""; echo "exit:$?"',
      []
    )

    assert.equal(result.stdout.trim(), '7080\nexit:0')
  })

  it('skips occupied ports after the exclusion', async () => {
    // Excluded 7081, occupied 7082..7085 → first usable is 7086.
    const result = await runWithFakeLsof(
      'find_free_port 7081 7081; echo "exit:$?"',
      ['7082', '7083', '7084', '7085']
    )

    assert.equal(result.stdout.trim(), '7086\nexit:0')
  })

  it('exhausts its attempts when every candidate is unusable', async () => {
    // 7080 excluded, 7081..7089 occupied → 10 attempts consumed → fail.
    // The function's return code travels via the echoed `exit:$?` (the
    // snippet's trailing echo is the last command), not the process code.
    const result = await runWithFakeLsof(
      'find_free_port 7080 7080; echo "exit:$?"',
      ['7081', '7082', '7083', '7084', '7085', '7086', '7087', '7088', '7089']
    )

    assert.equal(result.code, 0)
    assert.match(
      result.stdout,
      /(^|\n)exit:1(\n|$)/,
      'exhausted candidates must return failure (echoed exit status)'
    )
  })

  it('keeps working for a single-argument call (no exclusion)', async () => {
    const result = await runWithFakeLsof(
      'find_free_port 7080; echo "exit:$?"',
      ['7080', '7081']
    )

    assert.equal(result.stdout.trim(), '7082\nexit:0')
  })
})

describe('route-smoke.sh resolved preferred-port error paths (REP-1648)', () => {
  it('resolves the SMOKE_* variables into preferred-port values', () => {
    assert.match(
      scriptSource,
      /^WORKSPACE_PREFERRED="\$\{SMOKE_WORKSPACE_PORT:-7080\}"$/m,
      'the workspace preferred port must be resolved once, up front'
    )
    assert.match(
      scriptSource,
      /^ADMIN_PREFERRED="\$\{SMOKE_ADMIN_PORT:-7081\}"$/m,
      'the admin preferred port must be resolved once, up front'
    )
  })

  it('references the resolved values in the picker error messages', () => {
    assert.match(
      scriptSource,
      /could not find a free workspace port near \$WORKSPACE_PREFERRED/,
      'the workspace error must reference the resolved preferred value'
    )
    assert.match(
      scriptSource,
      /could not find a free admin port near \$ADMIN_PREFERRED/,
      'the admin error must reference the resolved preferred value'
    )
  })

  it('never references raw SMOKE_* variables outside their default assignment', () => {
    // With `set -u`, an unset $SMOKE_WORKSPACE_PORT referenced in an error
    // path aborts with "unbound variable" and masks the real error.
    const rawReferences = scriptSource
      .split('\n')
      .filter(line => /\$SMOKE_(WORKSPACE|ADMIN)_PORT/.test(line))
      .filter(line => !/^\s*(WORKSPACE|ADMIN)_PREFERRED="\$\{SMOKE_/.test(line))

    assert.deepEqual(
      rawReferences,
      [],
      `raw "$SMOKE_*" references outside the default assignments would abort under set -u: ${rawReferences.join(
        ' | '
      )}`
    )
  })

  it('passes the workspace port as the admin picker exclusion', () => {
    assert.match(
      scriptSource,
      /find_free_port "\$ADMIN_PREFERRED" "\$WORKSPACE_PORT"/,
      'the admin picker must exclude the workspace picked port'
    )
  })
})
