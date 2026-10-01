#!/usr/bin/env node
// REP-1653: mechanical proof-bundle assertion for the delivery-workflow §5
// audit gate (Step 5). Asserts the REP-1646 ui-verification capture artifacts
// (manifest.json + audit.md) satisfy the proof-bundle assertions that were
// previously orchestrator prompt text: manifest parse/coverage, screenshot
// existence, freshness, checkpoint provenance, changed-surface coverage, and
// the audit.md findings table.
//
// Consumer: delivery-workflow §5 Step 5 (`pnpm run ui:assert-audit`).
//
// Determinism: same inputs -> same report. The core never reads a clock
// (commitTimeMs is injected by the CLI from git) and never writes to stdout
// (the CLI owns all output); filesystem access and git are injectable for
// tests. Unlike classify-ui-diff — where the verdict is data and exit is 0 —
// ANY failed assertion here is a gate violation: the JSON report still prints,
// but the process exits 1.
//
// Flags:
//   --issue <id>            issue id (optional when inferred from candidate path)
//   --audit-dir <path>      candidate attempt directory (required)
//   --base <ref>            classification base, e.g. origin/main (required)
//   --commit <sha>          successful audit checkpoint commit (required)
//   --surface <name>        changed surface; repeat the flag (>=1 required)
//   --worktree-root <path>  worktree root (default: process.cwd())
//   --help, -h              show usage
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type AssertInputs = {
  issueId: string
  /** Optional for direct use of the assertion core; the CLI requires --audit-dir. */
  auditDir?: string
  /** Surfaces whose behavior changed since the last successful audit. */
  expectedSurfaces: readonly string[]
  /** --base, e.g. origin/main — compared against the manifest `base` field. */
  classificationBase: string
  /** --commit — must match the manifest auditCheckpointCommit. */
  checkpointCommit: string
  /** Injected — the core never reads a clock. */
  commitTimeMs: number
  /** Absolute; screenshot paths in the manifest resolve against it. */
  worktreeRoot: string
}

export type AssertionResult = { id: string; ok: boolean; detail?: string }

export type AssertReport = {
  mode: 'assert-audit'
  issue: string
  auditDir: string
  /** True iff every result is ok. */
  ok: boolean
  results: AssertionResult[]
}

export type AssertIo = {
  readFileSync?: (path: string, enc: 'utf8') => string
  statFileSync?: (path: string) => { size: number; isFile: () => boolean }
  realpathSync?: (path: string) => string
  execGit?: (args: string[]) => string
}

export const AUDIT_HEADER_SUBSTRING =
  'pillar | severity | evidence screenshot | description | disposition'

// Exact trimmed-line equality — a near-miss sentinel row is a finding row
// with an invalid disposition, not a no-findings pass.
export const NO_FINDINGS_SENTINEL =
  '| none | none | none | no findings | none |'

const DISPOSITION_RE = /^(?:fixed [0-9a-f]{1,40}|filed REP-\d+)$/i
const SEPARATOR_CELL_RE = /^:?-{3,}:?$/
// Strict ISO-8601: date + time + optional fractional seconds + Z or offset.
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

type ManifestState = { state?: unknown; screenshot?: unknown }
type ManifestSurface = {
  surface?: unknown
  auditedAtCommit?: unknown
  states?: unknown
}

// JSON.parse can return any JSON value; the manifest-derived assertions below
// only read plain-object shapes. Non-object roots and non-object entries
// (null, numbers, strings, booleans, arrays) are guarded into structured
// failed assertions so a malformed manifest can never throw its way out of
// the JSON report (exit 1 always emits the report).
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const describeJsonValue = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function defaultAuditDir(issueId: string, worktreeRoot: string): string {
  return join(worktreeRoot, 'tmp/ui-verification', issueId)
}

/**
 * Audit the audit.md findings table. Returns a list of problems (empty = ok):
 * the header must be present, only the contiguous table following the header
 * is examined (lines starting with `|`, stopping at the first line that does
 * not — a later markdown table must not produce false violations), separator
 * rows are skipped, the exact sentinel row is the valid no-findings form, and
 * every other row in that table is a finding row whose last cell must carry a
 * valid disposition (`fixed <commit>` | `filed REP-xxx`).
 */
export function auditFindingsProblems(auditText: string): string[] {
  const lines = auditText.split('\n')
  const headerIndex = lines.findIndex(line =>
    line.includes(AUDIT_HEADER_SUBSTRING)
  )
  if (headerIndex === -1) {
    return [
      `findings-table header not found (expected a line containing "${AUDIT_HEADER_SUBSTRING}")`,
    ]
  }

  const problems: string[] = []
  let rowCount = 0
  for (const line of lines.slice(headerIndex + 1)) {
    const trimmed = line.trim()
    // Table boundary: the findings table ends at the first line that does
    // not start with `|` — anything after it (prose, headings, a second
    // markdown table) is out of scope for this assertion.
    if (!trimmed.startsWith('|')) break
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim())
    // Markdown separator row (| --- | --- | ...) — not a finding row.
    if (cells.every(cell => SEPARATOR_CELL_RE.test(cell))) continue
    rowCount++
    if (trimmed === NO_FINDINGS_SENTINEL) continue
    const disposition = cells[cells.length - 1] ?? ''
    if (!DISPOSITION_RE.test(disposition)) {
      problems.push(
        `finding row has invalid disposition ${JSON.stringify(
          disposition
        )} (expected "fixed <commit>" | "filed REP-xxx"; \`none\` is reserved for the no-findings sentinel row): ${trimmed}`
      )
    }
  }
  if (rowCount === 0) {
    problems.push(
      'findings table has no rows — a header with zero finding rows is a gate violation, not a clean audit (use the exact no-findings sentinel row)'
    )
  }
  return problems
}

/**
 * Run every proof-bundle assertion (assert-all semantics — a failure never
 * stops evaluation). If the manifest cannot be parsed into a non-null plain
 * object (unreadable, invalid JSON, or a non-object root such as `null`),
 * the manifest-derived assertions are omitted from the results (fail-closed
 * short-circuit) while audit-findings still runs.
 */
export function assertAuditArtifacts(
  inputs: AssertInputs,
  io: AssertIo = {}
): AssertReport {
  const readFile =
    io.readFileSync ?? ((path: string) => readFileSync(path, 'utf8'))
  const statFile = io.statFileSync ?? (path => statSync(path))
  const realPath = io.realpathSync ?? (path => realpathSync(path))
  const auditDir =
    inputs.auditDir ?? defaultAuditDir(inputs.issueId, inputs.worktreeRoot)

  const results: AssertionResult[] = []
  const add = (id: string, ok: boolean, detail?: string): void => {
    results.push(ok ? { id, ok } : { id, ok, detail })
  }

  // 1. manifest-parses — missing/unreadable/invalid JSON all fail here.
  //    Fail-closed shape check: a root that parses but is not a non-null
  //    plain object (null, number, string, boolean, array) is a failure too —
  //    otherwise JSON.parse('null') would be recorded as ok and skip every
  //    manifest-derived assertion below.
  let manifest: Record<string, unknown> | null = null
  const manifestPath = join(auditDir, 'manifest.json')
  try {
    const raw = readFile(manifestPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isJsonObject(parsed)) {
      manifest = parsed
      add('manifest-parses', true)
    } else {
      add(
        'manifest-parses',
        false,
        `manifest.json parses but its root is not an object (${describeJsonValue(
          parsed
        )})`
      )
    }
  } catch (error) {
    add(
      'manifest-parses',
      false,
      `manifest.json unreadable or not valid JSON: ${(error as Error).message}`
    )
  }

  if (manifest !== null) {
    // Guard non-object surface entries: a bare `null`/scalar inside `surfaces`
    // must become a structured failure (naming the offending index), not an
    // uncaught TypeError.
    const surfacesIsArray = Array.isArray(manifest.surfaces)
    const surfacesRaw: unknown[] = surfacesIsArray
      ? (manifest.surfaces as unknown[])
      : []
    const surfaces: ManifestSurface[] = []
    const nonemptyProblems: string[] = []
    surfacesRaw.forEach((entry, index) => {
      if (isJsonObject(entry)) {
        surfaces.push(entry as ManifestSurface)
      } else {
        nonemptyProblems.push(
          `surfaces[${index}] is not an object (${describeJsonValue(entry)})`
        )
      }
    })

    // 2. manifest-nonempty — >=1 surface, and >=1 surface with >=1 state.
    const withStates = surfaces.filter(
      surface => Array.isArray(surface.states) && surface.states.length >= 1
    )
    if (!surfacesIsArray) {
      nonemptyProblems.push(
        `surfaces is not an array (${describeJsonValue(manifest.surfaces)})`
      )
    } else if (surfacesRaw.length === 0) {
      nonemptyProblems.push('surfaces array is empty')
    } else if (withStates.length === 0) {
      nonemptyProblems.push(
        `no surface carries a states array with >=1 entry (${surfaces.length} surface(s))`
      )
    }
    add(
      'manifest-nonempty',
      nonemptyProblems.length === 0,
      nonemptyProblems.join('; ') || undefined
    )

    // 3. candidate-audit-directory — changed-surface evidence must live in a
    //    distinct attempt directory beneath the issue's canonical bundle.
    const lexicalRoot = resolve(inputs.worktreeRoot)
    const lexicalIssueDir = resolve(
      lexicalRoot,
      'tmp/ui-verification',
      inputs.issueId
    )
    const lexicalAuditDir = resolve(lexicalRoot, auditDir)
    const candidateName = basename(lexicalAuditDir)
    const candidatePrefix = `candidate-${inputs.checkpointCommit}-`
    const candidateDirectoryProblems: string[] = []
    let issueDirReal: string | null = null
    let candidateAuditDirReal: string | null = null
    try {
      issueDirReal = realPath(lexicalIssueDir)
    } catch {
      // An unresolvable issue directory cannot prove a candidate attempt.
    }
    try {
      candidateAuditDirReal = realPath(lexicalAuditDir)
    } catch {
      // An unresolvable candidate directory cannot prove a distinct attempt.
    }
    if (inputs.expectedSurfaces.length > 0) {
      if (dirname(lexicalAuditDir) !== lexicalIssueDir) {
        candidateDirectoryProblems.push(
          'audit directory is not a direct child of the issue audit directory'
        )
      }
      if (
        !candidateName.startsWith(candidatePrefix) ||
        candidateName.length === candidatePrefix.length
      ) {
        candidateDirectoryProblems.push(
          `audit directory name must be ${candidatePrefix}<attempt>`
        )
      }
      if (issueDirReal === null || candidateAuditDirReal === null) {
        candidateDirectoryProblems.push(
          'issue audit directory or candidate audit directory cannot be canonicalized'
        )
      } else if (candidateAuditDirReal !== join(issueDirReal, candidateName)) {
        candidateDirectoryProblems.push(
          'audit directory canonical path does not match its distinct candidate path'
        )
      }
    }
    add(
      'candidate-audit-directory',
      candidateDirectoryProblems.length === 0,
      candidateDirectoryProblems.join('; ') || undefined
    )

    // 4. screenshots — every state's screenshot is a non-empty relative path
    //    resolving to a non-empty file inside the worktree root. Non-object
    //    state entries are guarded into named failures (same JSON-report
    //    contract: no uncaught TypeError, exit 1 still emits the report).
    const problems: string[] = []
    // Canonical containment hardening (REP-1653 review fix): the old lexical
    // resolve() + startsWith() check alone would pass a symlink pointing
    // outside the root, and a directory would pass the size check.
    // Canonicalize BOTH sides consistently — the tmpdir fixtures on macOS
    // are themselves under a symlink (/var -> /private/var), so one-sided
    // canonicalization would false-fail.
    let rootReal: string
    try {
      rootReal = realPath(lexicalRoot)
    } catch {
      // Unresolvable root (injectable-fs tests): fall back to lexical.
      rootReal = lexicalRoot
    }
    let auditDirReal: string
    try {
      auditDirReal = realPath(lexicalAuditDir)
    } catch {
      // Match the root fallback for injectable-fs tests and missing paths.
      auditDirReal = lexicalAuditDir
    }
    const changedSurfaceNames = new Set(inputs.expectedSurfaces)
    for (const surface of surfaces) {
      const statesRaw: unknown[] = Array.isArray(surface.states)
        ? (surface.states as unknown[])
        : []
      const surfaceLabel = String(surface.surface ?? '<unnamed surface>')
      statesRaw.forEach((state, stateIndex) => {
        if (!isJsonObject(state)) {
          problems.push(
            `${surfaceLabel}/states[${stateIndex}] is not an object (${describeJsonValue(
              state
            )})`
          )
          return
        }
        const stateRecord = state as ManifestState
        const label = `${surfaceLabel}/${String(
          stateRecord.state ?? '<unnamed state>'
        )}`
        const shot = stateRecord.screenshot
        if (typeof shot !== 'string' || shot.trim().length === 0) {
          problems.push(`${label}: screenshot path missing or empty`)
          return
        }
        if (isAbsolute(shot)) {
          problems.push(
            `${label}: screenshot must be worktree-root-relative, got absolute path ${shot}`
          )
          return
        }
        const resolvedShot = resolve(lexicalRoot, shot)
        if (resolvedShot === lexicalRoot) {
          problems.push(
            `${label}: screenshot resolves to the worktree root itself, not a file: ${shot}`
          )
          return
        }
        if (!resolvedShot.startsWith(lexicalRoot + sep)) {
          problems.push(
            `${label}: screenshot escapes the worktree root: ${shot}`
          )
          return
        }
        const isChangedSurface = changedSurfaceNames.has(surfaceLabel)
        if (
          isChangedSurface &&
          !resolvedShot.startsWith(lexicalAuditDir + sep)
        ) {
          problems.push(
            `${label}: screenshot is outside the candidate audit directory: ${shot}`
          )
          return
        }
        // Canonical containment: a lexically-inside path can still resolve
        // outside the root via a symlink. An unresolvable target (typically
        // nonexistent) falls through to the stat check, which reports it.
        let realShot: string | null = null
        try {
          realShot = realPath(resolvedShot)
        } catch {
          realShot = null
        }
        if (
          realShot !== null &&
          realShot !== rootReal &&
          !realShot.startsWith(rootReal + sep)
        ) {
          problems.push(
            `${label}: screenshot escapes the worktree root: ${shot}`
          )
          return
        }
        if (
          isChangedSurface &&
          realShot !== null &&
          realShot !== auditDirReal &&
          !realShot.startsWith(auditDirReal + sep)
        ) {
          problems.push(
            `${label}: screenshot is outside the candidate audit directory: ${shot}`
          )
          return
        }
        let stats: { size: number; isFile: () => boolean }
        try {
          stats = statFile(resolvedShot)
        } catch (error) {
          problems.push(
            `${label}: screenshot does not exist (${shot}): ${
              (error as Error).message
            }`
          )
          return
        }
        if (!stats.isFile()) {
          problems.push(`${label}: screenshot is not a regular file: ${shot}`)
          return
        }
        if (stats.size <= 0) {
          problems.push(`${label}: screenshot file is empty (0 bytes): ${shot}`)
        }
      })
    }
    add('screenshots', problems.length === 0, problems.join('; ') || undefined)

    // 5. freshness — right base, strict ISO-8601 generatedAt, strictly newer
    //    than the checkpoint commit (same-second capture fails).
    const freshnessProblems: string[] = []
    if (manifest.base !== inputs.classificationBase) {
      freshnessProblems.push(
        `manifest base ${JSON.stringify(
          manifest.base
        )} != classification base ${JSON.stringify(inputs.classificationBase)}`
      )
    }
    const generatedAt = manifest.generatedAt
    if (typeof generatedAt !== 'string' || !ISO_8601_RE.test(generatedAt)) {
      freshnessProblems.push(
        `generatedAt ${JSON.stringify(
          generatedAt
        )} is missing or not strict ISO-8601`
      )
    } else if (!(Date.parse(generatedAt) > inputs.commitTimeMs)) {
      freshnessProblems.push(
        `generatedAt ${generatedAt} is not newer than the checkpoint commit (${new Date(
          inputs.commitTimeMs
        ).toISOString()})`
      )
    }
    add(
      'freshness',
      freshnessProblems.length === 0,
      freshnessProblems.join('; ') || undefined
    )

    // 6. audit-checkpoint — the bundle itself must name the commit it proves.
    const auditCheckpointCommit = manifest.auditCheckpointCommit
    const checkpointProblems: string[] = []
    if (
      typeof auditCheckpointCommit !== 'string' ||
      auditCheckpointCommit.trim().length === 0
    ) {
      checkpointProblems.push('auditCheckpointCommit is missing or empty')
    } else if (auditCheckpointCommit !== inputs.checkpointCommit) {
      checkpointProblems.push(
        `manifest auditCheckpointCommit ${JSON.stringify(
          auditCheckpointCommit
        )} != asserted checkpoint commit ${JSON.stringify(
          inputs.checkpointCommit
        )}`
      )
    }
    add(
      'audit-checkpoint',
      checkpointProblems.length === 0,
      checkpointProblems.join('; ') || undefined
    )

    // 7. surface-coverage — every expected changed surface is recorded;
    //    extras are retained so unchanged surfaces may reuse older evidence.
    //    Unnamed surfaces record under the same `<unnamed surface>` label the
    //    screenshots assertion uses (never the empty string), so a blank
    //    --surface flag can never satisfy an unnamed entry.
    const recorded = new Set(
      surfaces.map(surface => String(surface.surface ?? '<unnamed surface>'))
    )
    const missing = [
      ...new Set(inputs.expectedSurfaces.filter(name => !recorded.has(name))),
    ]
    add(
      'surface-coverage',
      missing.length === 0,
      missing.length > 0
        ? `expected surfaces missing from manifest surfaces[].surface: ${missing.join(
            ', '
          )}`
        : undefined
    )

    // 8. surface-checkpoints — provenance is required for every surface, but
    //    only surfaces whose behavior changed in this audit pass must match
    //    the bundle's current checkpoint. Older evidence is reusable for an
    //    unchanged surface after the full delta has been reviewed.
    const changedSurfaces = new Set(inputs.expectedSurfaces)
    const surfaceCheckpointProblems: string[] = []
    for (const surface of surfaces) {
      const surfaceName = String(surface.surface ?? '<unnamed surface>')
      const auditedAtCommit = surface.auditedAtCommit
      if (
        typeof auditedAtCommit !== 'string' ||
        auditedAtCommit.trim().length === 0
      ) {
        surfaceCheckpointProblems.push(
          `${surfaceName}: auditedAtCommit is missing or empty`
        )
      } else if (
        changedSurfaces.has(surfaceName) &&
        auditedAtCommit !== inputs.checkpointCommit
      ) {
        surfaceCheckpointProblems.push(
          `${surfaceName}: auditedAtCommit ${JSON.stringify(
            auditedAtCommit
          )} != checkpoint commit ${JSON.stringify(inputs.checkpointCommit)}`
        )
      }
    }
    add(
      'surface-checkpoints',
      surfaceCheckpointProblems.length === 0,
      surfaceCheckpointProblems.join('; ') || undefined
    )
  }

  // 9. audit-findings — runs even when the manifest is unparseable.
  const auditPath = join(auditDir, 'audit.md')
  try {
    const problems = auditFindingsProblems(readFile(auditPath, 'utf8'))
    add(
      'audit-findings',
      problems.length === 0,
      problems.join('; ') || undefined
    )
  } catch (error) {
    add(
      'audit-findings',
      false,
      `audit.md unreadable: ${(error as Error).message}`
    )
  }

  return {
    mode: 'assert-audit',
    issue: inputs.issueId,
    auditDir,
    ok: results.every(result => result.ok),
    results,
  }
}

// --- CLI layer -------------------------------------------------------------

export type AssertOptions = {
  issue?: string
  auditDir?: string
  base?: string
  commit?: string
  surfaces?: string[]
  worktreeRoot?: string
  help?: boolean
}

export type CliParseResult = {
  options: AssertOptions
  error?: string
}

const FLAG_VALUE_DESCRIPTIONS: Record<string, string> = {
  '--issue': 'an issue id',
  '--audit-dir': 'a directory path',
  '--base': 'a git ref',
  '--commit': 'a commit sha',
  '--surface': 'a surface name',
  '--worktree-root': 'a directory path',
}

/**
 * Parse CLI args into AssertOptions; returns an error for malformed usage.
 * Left-to-right scan so a flag always consumes the immediately following
 * token as its value (mirrors classify-ui-diff parseCliArgs); --surface is
 * repeatable and duplicates collapse.
 */
export function parseCliArgs(args: string[]): CliParseResult {
  const options: AssertOptions = {}
  let surfaces: string[] | undefined
  const assigners: Record<string, (value: string) => void> = {
    '--issue': value => {
      options.issue = value
    },
    '--audit-dir': value => {
      options.auditDir = value
    },
    '--base': value => {
      options.base = value
    },
    '--commit': value => {
      options.commit = value
    },
    '--surface': value => {
      ;(surfaces ??= []).push(value)
    },
    '--worktree-root': value => {
      options.worktreeRoot = value
    },
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const assign = assigners[arg]
    if (assign) {
      const value = args[i + 1]
      if (value === undefined) {
        return {
          options,
          error: `${arg} requires a value (${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          })`,
        }
      }
      if (value.startsWith('--')) {
        return {
          options,
          error: `${arg} value "${value}" looks like another flag; expected ${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          }`,
        }
      }
      if (arg === '--surface' && value.trim().length === 0) {
        return {
          options,
          error: `--surface value "${value}" is blank; expected ${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          }`,
        }
      }
      assign(value)
      i++
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    return { options, error: `unknown argument "${arg}"` }
  }

  if (surfaces) {
    options.surfaces = [...new Set(surfaces)]
  }
  return { options }
}

export type AssertRunIo = AssertIo & {
  jsonOut?: (json: string) => void
  errorOut?: (message: string) => void
}

export type RunResult = { code: number }

function defaultExecGit(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
}

/**
 * Run one proof-bundle assertion and emit the JSON report. Execution errors
 * (missing/unreadable artifacts, git failure) print ERROR to stderr and exit 1
 * with no JSON verdict; assertion failures print the full report JSON and exit
 * 1 — any failed assertion is a gate violation.
 */
export function runAssert(
  options: AssertOptions,
  io: AssertRunIo = {}
): RunResult {
  const jsonOut = io.jsonOut ?? ((json: string) => console.log(json))
  const errorOut = io.errorOut ?? ((message: string) => console.error(message))
  const execGit = io.execGit ?? defaultExecGit

  const auditDirOption = options.auditDir
  if (!auditDirOption) {
    errorOut(
      'ERROR: --audit-dir <candidate-attempt-dir> is required for the proof assertion'
    )
    return { code: 1 }
  }
  if (!options.base) {
    errorOut(
      'ERROR: --base <ref> is required (the delivery-workflow §5 Step 2 classification base)'
    )
    return { code: 1 }
  }
  if (!options.commit) {
    errorOut(
      'ERROR: --commit <sha> is required (the delivery-workflow §5 Step 1 code checkpoint under audit)'
    )
    return { code: 1 }
  }
  if (!options.surfaces || options.surfaces.length === 0) {
    errorOut(
      'ERROR: at least one --surface <name> is required (repeat the flag per changed surface)'
    )
    return { code: 1 }
  }

  const worktreeRoot = resolve(options.worktreeRoot ?? process.cwd())
  const auditDir = resolve(worktreeRoot, auditDirOption)
  const auditDirName = basename(auditDir)
  const issueId =
    options.issue ??
    (auditDirName.startsWith('candidate-')
      ? basename(dirname(auditDir))
      : auditDirName)

  // Execution-error pre-check: missing/unreadable artifacts are an environment
  // failure, not a gate verdict — stderr ERROR, exit 1, no JSON.
  const readFile =
    io.readFileSync ?? ((path: string) => readFileSync(path, 'utf8'))
  try {
    readFile(join(auditDir, 'manifest.json'), 'utf8')
    readFile(join(auditDir, 'audit.md'), 'utf8')
  } catch (error) {
    errorOut(
      `ERROR: required audit artifact unreadable under ${auditDir}: ${
        (error as Error).message
      }`
    )
    return { code: 1 }
  }

  let commitTimeMs: number
  try {
    const commitIso = execGit([
      'show',
      '-s',
      '--format=%cI',
      options.commit,
    ]).trim()
    commitTimeMs = Date.parse(commitIso)
    if (!Number.isFinite(commitTimeMs)) {
      throw new Error(
        `unparseable commit timestamp ${JSON.stringify(commitIso)}`
      )
    }
  } catch (error) {
    errorOut(
      `ERROR: resolving --commit ${options.commit} timestamp failed: ${
        (error as Error).message
      }`
    )
    return { code: 1 }
  }

  const report = assertAuditArtifacts(
    {
      issueId,
      auditDir,
      expectedSurfaces: options.surfaces,
      classificationBase: options.base,
      checkpointCommit: options.commit,
      commitTimeMs,
      worktreeRoot,
    },
    io
  )
  jsonOut(JSON.stringify(report))
  return { code: report.ok ? 0 : 1 }
}

function printUsage(): void {
  console.error(`assert-audit-artifacts — mechanical proof-bundle assertion (REP-1653)

Asserts the supplied candidate attempt's REP-1646 ui-verification artifacts
(manifest.json + audit.md) satisfy the
delivery-workflow §5 Step 5 proof-bundle assertions. Any failed assertion is
a gate violation.

Usage:
  pnpm run ui:assert-audit --audit-dir tmp/ui-verification/REP-xxx/candidate-<checkpoint-sha>-<attempt> \\
  --base <classification-base> --commit <audit-checkpoint-sha> --surface <changed-surface-1> --surface <changed-surface-2> ...
                                    The delivery-workflow §5 Step 5 invocation
                                    (no -- separator: pnpm forwards it
                                    literally). --commit is the code commit
                                    audited by this bundle; each --surface names
                                    a UI surface whose behavior changed since the
                                    previous successful audit checkpoint.
  --issue <id>                    Optional when it can be inferred from the
                                  candidate directory's parent issue directory.
  --audit-dir <candidate-attempt-dir> (required)
                                  Candidate attempt directory under the issue's
                                  canonical audit directory.
  --worktree-root <path>          Worktree root for resolving screenshot paths
                                  (default: process.cwd()).
  tsx scripts/assert-audit-artifacts.ts --help (-h)
                                  Show this help.

Exit codes:
  0  every assertion passed
  1  gate violation (JSON on stdout lists every failed assertion) or execution
     error (missing/unreadable artifacts, git failure — nothing on stdout)

JSON report:
  { "mode": "assert-audit", "issue", "auditDir", "ok",
    "results": [ { "id", "ok", "detail" } ] }`)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const { options, error } = parseCliArgs(process.argv.slice(2))
  if (error) {
    console.error(`ERROR: ${error}`)
    printUsage()
    process.exit(1)
  }
  if (options.help) {
    printUsage()
    process.exit(0)
  }
  process.exitCode = runAssert(options).code
}
