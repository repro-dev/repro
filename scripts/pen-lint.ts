#!/usr/bin/env node
// REP-1618: deterministic pen -> code sync CLI.
//
// Replaces the component-map registry with a master naming
// convention: every master is named <package>::<ComponentName> (e.g.
// design::Button) and the package prefix must resolve to a real export
// from packages/<package>/src. The scope is always @repro, so the bare
// package name disambiguates.
//
// Modes:
//   - Check mode (default): read-only validation of the naming convention
//     and export resolvability against repro.pen. Exits 0 when clean,
//     non-zero on violations.
//   - Dry-run mode (--dry-run): lists every required resolution as machine
//     JSON on stdout (candidate ranking per master) without touching the
//     pen file. Exit 0 iff every master is resolvable.
//   - Apply mode (--apply): renames masters to package::ComponentName,
//     writes { type: 'master', package, component } metadata, and saves
//     repro.pen. Single-candidate masters auto-rename; ambiguous masters
//     prompt in a TTY or emit JSON + exit non-zero otherwise. Exit
//     non-zero for anything it cannot resolve.
//   - Export mode (--export): exports screens to PNG + HTML via the pen CLI
//     and regenerates the catalog (with the screens index) in
//     tmp/pen-catalog.json.
import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..')
export const PEN_FILE = resolve(REPO_ROOT, 'repro.pen')
export const CATALOG_OUTPUT = resolve(REPO_ROOT, 'tmp/pen-catalog.json')
export const EXPORT_DIR = resolve(REPO_ROOT, 'tmp/pen-screens')

export interface PenNode {
  type: string
  id: string
  name: string
  reusable?: boolean
  metadata?: Record<string, string>
  [key: string]: unknown
}

export interface PenVariable {
  type: string
  value: unknown
}

export interface PenFile {
  version: string
  children: PenNode[]
  variables?: Record<string, PenVariable>
  [key: string]: unknown
}

export interface MasterInfo {
  id: string
  name: string
  dims: Record<string, unknown>
  variableRefs: string[]
  metadata?: Record<string, string>
}

export interface ScreenInfo {
  id: string
  name: string
  normalizedName: string
  width?: unknown
  height?: unknown
}

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------

export function parsePenJson(raw: string): PenFile {
  const parsed = JSON.parse(raw) as PenFile
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray(parsed.children)
  ) {
    throw new Error('pen file is missing a children array')
  }
  return parsed
}

/** Strip a leading "Screen: " prefix; leave everything else untouched. */
export function normalizeScreenName(name: string): string {
  const prefix = 'Screen: '
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

/** Convert a screen name into a safe filename (lowercase, no colons). */
function sanitizeName(name: string): string {
  return name
    .replaceAll(':', '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '')
}

/** Collect `$`-prefixed token references from any nested value. */
export function extractVariableRefs(
  node: unknown,
  refs: Set<string> = new Set()
): Set<string> {
  if (typeof node === 'string') {
    const match = /^\$([a-zA-Z0-9-]+)$/.exec(node)
    if (match) refs.add(match[1]!)
    return refs
  }
  if (Array.isArray(node)) {
    for (const item of node) extractVariableRefs(item, refs)
    return refs
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) extractVariableRefs(value, refs)
  }
  return refs
}

/** Reusable frames are the masters; capture dims + variable refs. */
export function extractMasters(pen: PenFile): MasterInfo[] {
  return pen.children
    .filter(child => child.type === 'frame' && child.reusable === true)
    .map(child => {
      const dims: Record<string, unknown> = {}
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        if (child[key] !== undefined) dims[key] = child[key]
      }
      return {
        id: child.id,
        name: child.name,
        dims,
        variableRefs: [...extractVariableRefs(child)].sort(),
        metadata:
          child.metadata && typeof child.metadata === 'object'
            ? (child.metadata as Record<string, string>)
            : undefined,
      }
    })
}

/** Non-reusable top-level frames are the screens. */
export function extractScreens(pen: PenFile): ScreenInfo[] {
  return pen.children
    .filter(child => child.type === 'frame' && !child.reusable)
    .map(child => ({
      id: child.id,
      name: child.name,
      normalizedName: normalizeScreenName(child.name),
      width: child.width,
      height: child.height,
    }))
}

export function extractVariables(pen: PenFile): Record<string, PenVariable> {
  return pen.variables ?? {}
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export const MASTER_NAME_PATTERN = /^[a-z][a-z0-9-]*::[A-Z][a-zA-Z0-9]*$/

/**
 * Masters follow package::ComponentName (:: as namespace separator). The
 * component part is the exported symbol name, always uppercase-first
 * (design::Button, never design::button). Exact-case export resolvability is
 * enforced separately in check/apply modes.
 */
export function validateMasterName(name: string): boolean {
  return MASTER_NAME_PATTERN.test(name)
}

/** Split "pkg::Component" into [pkg, Component]. */
export function splitMasterName(name: string): [string, string] {
  const idx = name.indexOf('::')
  return [name.slice(0, idx), name.slice(idx + 2)]
}

/** Map a package name to packages/<pkg>/, null when it does not exist. */
export function resolvePackagePath(
  pkg: string,
  repoRoot: string = REPO_ROOT
): string | null {
  const pkgDir = resolve(repoRoot, 'packages', pkg)
  return existsSync(pkgDir) ? pkgDir : null
}

const EXPORT_STAR_RE = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g
const EXPORT_STAR_AS_RE =
  /export\s+\*\s+as\s+([A-Za-z0-9_]+)\s+from\s+['"]([^'"]+)['"]/g
const EXPORT_NAMED_RE =
  /export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s+['"]([^'"]+)['"])?/g
const EXPORT_DECL_RE =
  /export\s+(?:declare\s+)?(?:const|function|class|let|var|enum|type|interface|abstract\s+class)\s+([A-Za-z0-9_]+)/g

/** Parse a brace list like "A, B as C, D" into exported names (alias target). */
function parseExportNames(braces: string): string[] {
  return braces
    .split(',')
    .map(part => part.trim().replace(/^type\s+/, ''))
    .filter(Boolean)
    .map(part => {
      const asMatch = /\s+as\s+([A-Za-z0-9_]+)$/.exec(part)
      return asMatch ? asMatch[1]! : part
    })
}

/** Resolve "./X" to the module file under srcDir (X.ts/X.tsx/X/index.ts|tsx). */
function resolveModulePath(srcDir: string, specifier: string): string[] {
  if (!specifier.startsWith('./')) return []
  const base = resolve(srcDir, specifier.slice(2))
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]
  return candidates.filter(candidate => existsSync(candidate))
}

/**
 * True when <comp> is exported from packages/<pkg>/src. Resolves re-export
 * chains (`export * from './X'`) recursively, bounded and cycle-guarded.
 */
export function checkComponentExport(
  pkg: string,
  comp: string,
  repoRoot: string = REPO_ROOT
): boolean {
  const srcDir = resolve(repoRoot, 'packages', pkg, 'src')
  return collectExports(srcDir, new Set(), 0).has(comp)
}

function collectExports(
  srcDir: string,
  seen: Set<string>,
  depth: number
): Set<string> {
  const names = new Set<string>()
  if (depth > 5) return names
  const indexFile = [
    resolve(srcDir, 'index.ts'),
    resolve(srcDir, 'index.tsx'),
  ].find(candidate => existsSync(candidate))
  if (!indexFile || seen.has(indexFile)) return names
  seen.add(indexFile)

  const source = readFileSync(indexFile, 'utf8')
  const addAll = (
    regex: RegExp,
    pick: (match: RegExpExecArray) => string[]
  ) => {
    for (const match of source.matchAll(regex)) {
      for (const name of pick(match)) names.add(name)
    }
  }

  addAll(EXPORT_DECL_RE, match => [match[1]!])
  addAll(EXPORT_STAR_AS_RE, match => [match[1]!])
  addAll(EXPORT_NAMED_RE, match => {
    const from = match[2]
    const braceNames = parseExportNames(match[1]!)
    // Named re-exports without `from` are exported names directly.
    if (!from) return braceNames
    return braceNames // explicit re-export list still names the symbols
  })

  // Recurse into `export * from './X'` and `export { A } from './X'` chains.
  for (const match of source.matchAll(EXPORT_STAR_RE)) {
    for (const modulePath of resolveModulePath(srcDir, match[1]!)) {
      if (seen.has(modulePath)) continue
      const dir = dirname(modulePath)
      const nextSeen = new Set(seen)
      const next = collectExports(dir, nextSeen, depth + 1)
      for (const name of next) names.add(name)
    }
  }
  for (const match of source.matchAll(EXPORT_NAMED_RE)) {
    const from = match[2]
    if (!from) continue
    for (const modulePath of resolveModulePath(srcDir, from)) {
      if (seen.has(modulePath)) continue
      const next = collectExports(dirname(modulePath), new Set(seen), depth + 1)
      for (const name of next) names.add(name)
    }
  }

  return names
}

/**
 * Walk every node (skipping the variable declaration table) and return the
 * sorted list of `$` refs that do not resolve to a declared variable.
 */
export function validateVariableRefs(pen: PenFile): string[] {
  const declared = new Set(Object.keys(extractVariables(pen)))
  const used = new Set<string>()
  for (const child of pen.children) {
    for (const ref of extractVariableRefs(child)) used.add(ref)
  }
  if (pen.themes) {
    for (const ref of extractVariableRefs(pen.themes)) used.add(ref)
  }
  return [...used].filter(ref => !declared.has(ref)).sort()
}

/**
 * Best-effort: find inline frames inside screens whose name collides with a
 * master name (ad-hoc duplication instead of a ref). Advisory only — the
 * Component Gallery intentionally inlines demo frames, so this never blocks.
 */
export function findScreenShapeDuplicates(
  pen: PenFile,
  masterNames: Set<string>
): string[] {
  const warnings: string[] = []
  const screens = extractScreens(pen)
  for (const screen of screens) {
    const frame = pen.children.find(child => child.id === screen.id)
    if (!frame || !Array.isArray(frame.children)) continue
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if (
        obj.type === 'frame' &&
        typeof obj.name === 'string' &&
        masterNames.has(obj.name)
      ) {
        warnings.push(
          `${screen.normalizedName}: inline frame "${obj.name}" duplicates a master shape (use a ref instead)`
        )
      }
      if (Array.isArray(obj.children)) {
        for (const child of obj.children) visit(child)
      }
    }
    visit(frame)
  }
  return warnings
}

// ---------------------------------------------------------------------------
// Candidate inference (replaces the component map)
// ---------------------------------------------------------------------------

/**
 * Re-export names per package, computed once per run by reusing the
 * battle-tested `collectExports` barrel parser. Packages without a
 * src/index.ts|tsx are skipped.
 */
export function collectAllPackageExports(
  repoRoot: string = REPO_ROOT
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  const packagesDir = resolve(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return result
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const srcDir = resolve(packagesDir, entry.name, 'src')
    const indexFile = [
      resolve(srcDir, 'index.ts'),
      resolve(srcDir, 'index.tsx'),
    ].find(candidate => existsSync(candidate))
    if (!indexFile) continue
    result.set(entry.name, collectExports(srcDir, new Set(), 0))
  }
  return result
}

export interface CandidateInfo {
  package: string
  component: string
  confidence: string
}

/** Standard Levenshtein edit distance (small strings, bounded by export size). */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i] as number[]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    prev = curr
  }
  return prev[n]!
}

const byPkgComp = (a: CandidateInfo, b: CandidateInfo): number =>
  a.package === b.package
    ? a.component.localeCompare(b.component)
    : a.package.localeCompare(b.package)

/**
 * Suggest package::ComponentName bindings for a master name.
 *
 * Tier 1 (exact): exported names equal to the master's component-name part
 * (text after `::`, or the whole name when unprefixed) whose qualified form
 * passes `validateMasterName` — the ONLY tier that ever auto-applies.
 * Tier 2 (closest, zero-exact only): case-insensitive exact -> prefix ->
 * substring -> edit distance, capped at ~3. Never auto-applied.
 */
export function inferCandidates(
  masterName: string,
  exportsByPackage: Map<string, Set<string>>
): { exact: string[]; closest: CandidateInfo[] } {
  const componentPart = masterName.includes('::')
    ? (masterName.split('::').pop() as string)
    : masterName

  const exact: string[] = []
  const caseInsensitive: CandidateInfo[] = []
  const prefix: CandidateInfo[] = []
  const substring: CandidateInfo[] = []
  const edit: Array<CandidateInfo & { distance: number }> = []

  for (const pkg of [...exportsByPackage.keys()].sort()) {
    const names = exportsByPackage.get(pkg)!
    for (const name of [...names].sort()) {
      const qualified = `${pkg}::${name}`
      if (name === componentPart && validateMasterName(qualified)) {
        exact.push(qualified)
        continue
      }
      // Closest tiers only matter when there is no exact candidate at all.
      if (exact.length > 0) continue
      if (name.toLowerCase() === componentPart.toLowerCase()) {
        caseInsensitive.push({
          package: pkg,
          component: name,
          confidence: 'case-insensitive',
        })
      } else if (name.startsWith(componentPart)) {
        prefix.push({ package: pkg, component: name, confidence: 'prefix' })
      } else if (name.includes(componentPart) || componentPart.includes(name)) {
        substring.push({
          package: pkg,
          component: name,
          confidence: 'substring',
        })
      } else {
        const distance = levenshtein(componentPart, name)
        if (distance <= Math.max(3, Math.floor(componentPart.length / 3))) {
          edit.push({
            package: pkg,
            component: name,
            confidence: 'edit',
            distance,
          })
        }
      }
    }
  }

  if (exact.length > 0) return { exact: exact.sort(), closest: [] }

  const editSorted = edit
    .sort((a, b) => a.distance - b.distance || byPkgComp(a, b))
    .map(({ distance: _distance, ...rest }) => rest)
  const closest = [
    ...caseInsensitive.sort(byPkgComp),
    ...prefix.sort(byPkgComp),
    ...substring.sort(byPkgComp),
    ...editSorted,
  ].slice(0, 3)

  return { exact, closest }
}

// ---------------------------------------------------------------------------
// Catalog (runs in check and export modes)
// ---------------------------------------------------------------------------

export function buildScreensIndex(
  screens: ScreenInfo[]
): Record<string, string> {
  const index: Record<string, string> = {}
  for (const screen of screens) index[screen.normalizedName] = screen.id
  return index
}

function writeCatalog(
  pen: PenFile,
  catalogOutput: string,
  log: (msg: string) => void
): void {
  mkdirSync(dirname(catalogOutput), { recursive: true })
  const screens = extractScreens(pen)
  const catalog = {
    masters: extractMasters(pen),
    screens,
    screensIndex: buildScreensIndex(screens),
    variables: extractVariables(pen),
  }
  writeFileSync(catalogOutput, JSON.stringify(catalog, null, 2) + '\n')
  log(`Catalog written to ${catalogOutput}`)
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export interface RunOptions {
  penFile?: string
  catalogOutput?: string
  exportDir?: string
  log?: (msg: string) => void
  jsonOut?: (json: string) => void
  select?: Record<string, string>
  tty?: boolean
  prompt?: (masterName: string, choices: string[]) => Promise<number | null>
}

export type MasterStatus =
  | 'conforming'
  | 'auto'
  | 'select'
  | 'ambiguous'
  | 'no-candidate'
  | 'violation'

export interface PlanEntry {
  masterId: string
  masterName: string
  status: MasterStatus
  proposedName?: string
  candidates?: CandidateInfo[]
  closestMatches?: CandidateInfo[]
  reason?: string
}

export interface ResolutionPlan {
  entries: PlanEntry[]
  resolved: number
  unresolved: number
  invalidSelect: string[]
}

/**
 * Shared per-master resolution plan used by dry-run: for every master,
 * decide whether it conforms, can be auto-renamed, needs --select, is
 * ambiguous, has no candidate, or is a violation.
 */
export function buildResolutionPlan(
  pen: PenFile,
  exportsByPackage: Map<string, Set<string>>,
  select: Record<string, string>
): ResolutionPlan {
  const masters = extractMasters(pen)
  const entries: PlanEntry[] = []
  const seenIds = new Set<string>()
  let resolved = 0
  let unresolved = 0

  for (const master of masters) {
    seenIds.add(master.id)
    const override = select[master.id]
    if (override !== undefined) {
      const validation = validateResolvedName(override, exportsByPackage)
      if (!validation.ok) {
        entries.push({
          masterId: master.id,
          masterName: master.name,
          status: 'violation',
          reason: `--select "${override}" invalid: ${validation.reason}`,
        })
        unresolved++
      } else {
        entries.push({
          masterId: master.id,
          masterName: master.name,
          status: 'select',
          proposedName: override,
          candidates: [
            {
              package: validation.pkg,
              component: validation.comp,
              confidence: 'exact',
            },
          ],
        })
        resolved++
      }
      continue
    }

    if (validateMasterName(master.name)) {
      const [pkg, comp] = splitMasterName(master.name)
      const ex = exportsByPackage.get(pkg)
      if (!resolvePackagePath(pkg)) {
        entries.push({
          masterId: master.id,
          masterName: master.name,
          status: 'violation',
          reason: `package "${pkg}" does not exist`,
        })
        unresolved++
      } else if (!ex || !ex.has(comp)) {
        entries.push({
          masterId: master.id,
          masterName: master.name,
          status: 'violation',
          reason: `"${comp}" is not exported from @repro/${pkg}`,
        })
        unresolved++
      } else {
        entries.push({
          masterId: master.id,
          masterName: master.name,
          status: 'conforming',
        })
        resolved++
      }
      continue
    }

    const inference = inferCandidates(master.name, exportsByPackage)
    if (inference.exact.length === 1) {
      const target = inference.exact[0]!
      const [pkg, comp] = splitMasterName(target)
      entries.push({
        masterId: master.id,
        masterName: master.name,
        status: 'auto',
        proposedName: target,
        candidates: [{ package: pkg, component: comp, confidence: 'exact' }],
      })
      resolved++
    } else if (inference.exact.length > 1) {
      entries.push({
        masterId: master.id,
        masterName: master.name,
        status: 'ambiguous',
        candidates: inference.exact.map(target => {
          const [pkg, comp] = splitMasterName(target)
          return { package: pkg, component: comp, confidence: 'exact' }
        }),
      })
      unresolved++
    } else {
      entries.push({
        masterId: master.id,
        masterName: master.name,
        status: 'no-candidate',
        closestMatches: inference.closest,
      })
      unresolved++
    }
  }

  const invalidSelect: string[] = []
  for (const [id] of Object.entries(select)) {
    if (!seenIds.has(id)) {
      invalidSelect.push(`--select references unknown master "${id}"`)
      unresolved++
    }
  }

  return { entries, resolved, unresolved, invalidSelect }
}

/** Validate a user-supplied package::ComponentName resolution. */
function validateResolvedName(
  name: string,
  exportsByPackage: Map<string, Set<string>>
): { ok: true; pkg: string; comp: string } | { ok: false; reason: string } {
  if (!validateMasterName(name)) {
    return { ok: false, reason: 'not package::ComponentName' }
  }
  const [pkg, comp] = splitMasterName(name)
  if (!resolvePackagePath(pkg)) {
    return { ok: false, reason: `package "${pkg}" does not exist` }
  }
  const ex = exportsByPackage.get(pkg)
  if (!ex || !ex.has(comp)) {
    return { ok: false, reason: `"${comp}" is not exported from @repro/${pkg}` }
  }
  return { ok: true, pkg, comp }
}

// ---------------------------------------------------------------------------
// Check mode (default)
// ---------------------------------------------------------------------------

export function runCheck(options: RunOptions = {}): number {
  const penFile = options.penFile ?? PEN_FILE
  const catalogOutput = options.catalogOutput ?? CATALOG_OUTPUT
  const log = options.log ?? ((msg: string) => console.error(msg))

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }
  writeCatalog(pen, catalogOutput, log)

  const violations: string[] = []
  const masters = extractMasters(pen)
  const exportsByPackage = collectAllPackageExports()

  for (const master of masters) {
    if (validateMasterName(master.name)) {
      const [pkg, comp] = splitMasterName(master.name)
      if (!resolvePackagePath(pkg)) {
        violations.push(`master ${master.id}: package "${pkg}" does not exist`)
        continue
      }
      const ex = exportsByPackage.get(pkg)
      if (!ex || !ex.has(comp)) {
        violations.push(
          `master ${master.id}: "${comp}" is not exported from @repro/${pkg}`
        )
      }
      continue
    }

    // Unprefixed / non-conforming: recommend candidates, never a command.
    const inference = inferCandidates(master.name, exportsByPackage)
    if (inference.exact.length === 1) {
      violations.push(
        `master ${master.id} "${master.name}" does not have a package name prefix — did you mean \`${inference.exact[0]}\`?`
      )
    } else if (inference.exact.length > 1) {
      const options = inference.exact.map(n => `\`${n}\``).join(', ')
      violations.push(
        `master ${master.id} "${master.name}" has multiple candidate packages — did you mean one of ${options}?`
      )
    } else {
      const matches = inference.closest
        .map(c => `\`${c.package}::${c.component}\``)
        .join(', ')
      violations.push(
        `master ${master.id} "${master.name}" has no matching component export — closest matches: ${matches}. Flag for human resolution.`
      )
    }
  }

  // Variable refs must resolve.
  const missingRefs = validateVariableRefs(pen)
  for (const ref of missingRefs) {
    violations.push(`dangling variable ref: $${ref}`)
  }

  // Best-effort screen-children check — advisory only.
  const masterNames = new Set(masters.map(m => m.name))
  for (const warning of findScreenShapeDuplicates(pen, masterNames)) {
    log(`warning: ${warning}`)
  }

  if (violations.length > 0) {
    for (const violation of violations) log(`violation: ${violation}`)
    log(
      `${violations.length} violation(s) found — run 'tsx scripts/pen-lint.ts --apply' to auto-fix naming/metadata.`
    )
    return 1
  }
  log(
    'pen-lint check passed: all masters, packages, exports, and variable refs are clean.'
  )
  return 0
}

// ---------------------------------------------------------------------------
// Dry-run mode (--dry-run)
// ---------------------------------------------------------------------------

export function runDryRun(options: RunOptions = {}): number {
  const penFile = options.penFile ?? PEN_FILE
  const log = options.log ?? ((msg: string) => console.error(msg))
  const jsonOut = options.jsonOut ?? ((json: string) => console.log(json))

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }

  const exportsByPackage = collectAllPackageExports()
  const plan = buildResolutionPlan(pen, exportsByPackage, options.select ?? {})

  const report = {
    mode: 'dry-run',
    clean: plan.unresolved === 0,
    resolved: plan.resolved,
    unresolved: plan.unresolved,
    invalidSelect: plan.invalidSelect,
    masters: plan.entries,
  }
  jsonOut(JSON.stringify(report, null, 2))
  log(
    `dry-run: ${plan.resolved} master(s) resolvable, ${plan.unresolved} unresolved.`
  )
  return plan.unresolved === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------
// Apply mode (--apply)
// ---------------------------------------------------------------------------

/**
 * Rename a master node and set its resolved-binding metadata. Returns true
 * when the node actually changed (name or metadata), so the pen file is only
 * written when there is a real diff.
 */
function applyBinding(
  node: PenNode,
  masterId: string,
  name: string,
  pkg: string,
  comp: string,
  log: (msg: string) => void
): boolean {
  let changed = false
  if (node.name !== name) {
    log(`renaming master ${masterId} "${node.name}" -> ${name}`)
    node.name = name
    changed = true
  }
  const metadata: Record<string, string> = {
    type: 'master',
    package: pkg,
    component: comp,
  }
  const current =
    node.metadata && typeof node.metadata === 'object'
      ? node.metadata
      : undefined
  if (
    !current ||
    current.type !== 'master' ||
    current.package !== pkg ||
    current.component !== comp
  ) {
    node.metadata = metadata
    changed = true
  }
  return changed
}

/** Numbered confirmation prompt for ambiguous masters (TTY only). */
async function interactivePrompt(
  masterName: string,
  choices: string[]
): Promise<number | null> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    process.stderr.write(
      `Master "${masterName}" has multiple candidate packages:\n`
    )
    choices.forEach((c, i) => process.stderr.write(`  [${i + 1}] ${c}\n`))
    const answer = await rl.question('Select [1-N] / s=skip / q=quit: ')
    const trimmed = answer.trim()
    if (trimmed === 's' || trimmed === 'q' || trimmed === '') return null
    const idx = Number.parseInt(trimmed, 10)
    if (Number.isNaN(idx) || idx < 1 || idx > choices.length) return null
    return idx - 1
  } finally {
    rl.close()
  }
}

export async function runApply(options: RunOptions = {}): Promise<number> {
  const penFile = options.penFile ?? PEN_FILE
  const log = options.log ?? ((msg: string) => console.error(msg))
  const jsonOut = options.jsonOut ?? ((json: string) => console.log(json))
  const tty = options.tty ?? process.stdout.isTTY
  const prompt = options.prompt ?? interactivePrompt

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }

  const exportsByPackage = collectAllPackageExports()
  const select = options.select ?? {}
  const masters = extractMasters(pen)
  const unresolved: string[] = []
  const ambiguousEntries: PlanEntry[] = []
  let accepted = 0
  let skipped = 0
  let resolvedByPrompt = 0
  let changed = false

  for (const master of masters) {
    const node = pen.children.find(child => child.id === master.id)
    if (!node) continue

    const override = select[master.id]
    if (override !== undefined) {
      const validation = validateResolvedName(override, exportsByPackage)
      if (!validation.ok) {
        unresolved.push(
          `master ${master.id} "${master.name}": --select "${override}" invalid — ${validation.reason}`
        )
        continue
      }
      if (
        applyBinding(
          node,
          master.id,
          override,
          validation.pkg,
          validation.comp,
          log
        )
      ) {
        changed = true
      }
      accepted++
      continue
    }

    if (validateMasterName(master.name)) {
      const [pkg, comp] = splitMasterName(master.name)
      const ex = exportsByPackage.get(pkg)
      if (!ex || !ex.has(comp)) {
        unresolved.push(
          `master ${master.id} "${master.name}": "${comp}" is not exported from @repro/${pkg}`
        )
        continue
      }
      if (applyBinding(node, master.id, master.name, pkg, comp, log)) {
        changed = true
      }
      accepted++
      continue
    }

    const inference = inferCandidates(master.name, exportsByPackage)
    if (inference.exact.length === 1) {
      // Single unambiguous candidate -> auto-rename without prompting.
      const target = inference.exact[0]!
      const [pkg, comp] = splitMasterName(target)
      if (applyBinding(node, master.id, target, pkg, comp, log)) {
        changed = true
      }
      accepted++
      continue
    }
    if (inference.exact.length > 1) {
      const entry: PlanEntry = {
        masterId: master.id,
        masterName: master.name,
        status: 'ambiguous',
        candidates: inference.exact.map(target => {
          const [pkg, comp] = splitMasterName(target)
          return { package: pkg, component: comp, confidence: 'exact' }
        }),
      }
      ambiguousEntries.push(entry)
      if (tty) {
        const choice = await prompt(master.name, inference.exact)
        if (choice !== null && choice >= 0 && choice < inference.exact.length) {
          resolvedByPrompt++
          const target = inference.exact[choice]!
          const [pkg, comp] = splitMasterName(target)
          if (applyBinding(node, master.id, target, pkg, comp, log)) {
            changed = true
          }
          accepted++
        } else {
          unresolved.push(
            `master ${master.id} "${master.name}": skipped in confirmation prompt`
          )
        }
      } else {
        unresolved.push(
          `master ${master.id} "${
            master.name
          }": ambiguous (${inference.exact.join(
            ', '
          )}) — re-run with --select ${master.id}=<package::ComponentName>`
        )
      }
      continue
    }

    // No candidate: skip, report closest matches, flag for human resolution.
    skipped++
    const matches = inference.closest
      .map(c => `\`${c.package}::${c.component}\``)
      .join(', ')
    unresolved.push(
      `master ${master.id} "${master.name}": no matching component export — closest matches: ${matches}. Flag for human resolution.`
    )
  }

  for (const [id] of Object.entries(select)) {
    if (!masters.some(m => m.id === id)) {
      unresolved.push(`--select references unknown master "${id}"`)
    }
  }

  if (ambiguousEntries.length > 0 && !tty) {
    jsonOut(
      JSON.stringify({ mode: 'apply', masters: ambiguousEntries }, null, 2)
    )
  }

  if (changed) {
    writeFileSync(penFile, JSON.stringify(pen, null, 2) + '\n')
  }

  log(
    `apply summary: ${accepted} accepted, ${skipped} skipped, ${
      // Prompt-resolved masters are accepted, not ambiguous.
      ambiguousEntries.length - resolvedByPrompt
    } ambiguous, ${unresolved.length} unresolved.`
  )
  if (unresolved.length > 0) {
    for (const issue of unresolved) log(`unresolved: ${issue}`)
    return 1
  }
  if (changed) {
    log(`Applied master renames and metadata to ${penFile}`)
  } else {
    log(`pen file already conforming — no changes (${penFile})`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// Export mode (--export)
// ---------------------------------------------------------------------------

/** Strip ANSI escapes and pull the tool-response JSON from a session stream. */
export function extractJsonResponse(stdout: string): unknown | null {
  const esc = String.fromCharCode(27)
  const clean = stdout.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '')
  const chunks = clean.split('pen > ')
  const last = chunks[chunks.length - 1] ?? ''
  const start = last.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < last.length; i++) {
    const ch = last[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return JSON.parse(last.slice(start, i + 1)) as unknown
      }
    }
  }
  return null
}

function runPenInteractive(
  penFile: string,
  commands: string[],
  options: { stdoutFile?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    // The pen CLI truncates large stdout writes when stdout is a pipe
    // (~64KB cap observed). Redirect stdout to a regular file and read it
    // back so large export_html responses arrive intact.
    const stdoutFd = options.stdoutFile
      ? openSync(options.stdoutFile, 'w')
      : undefined
    const pen = spawn(
      'pen',
      ['interactive', '-i', penFile, '-o', '/dev/null'],
      {
        stdio: ['pipe', stdoutFd ?? 'pipe', 'pipe'],
        env: process.env,
      }
    )
    let stdout = ''
    let stderr = ''
    if (stdoutFd) {
      pen.stdout?.on('data', () => {
        /* piped to file via fd */
      })
    } else {
      pen.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
    }
    pen.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    pen.on('error', err => {
      if (stdoutFd) closeSync(stdoutFd)
      reject(new Error(`Failed to start pen CLI: ${err.message}`))
    })
    pen.on('close', code => {
      if (stdoutFd) {
        closeSync(stdoutFd)
        stdout = readFileSync(options.stdoutFile!, 'utf8')
      }
      resolvePromise({ code: code ?? 1, stdout, stderr })
    })
    pen.stdin.write(commands.join('\n'))
    pen.stdin.end()
  })
}

async function exportScreensPNG(
  penFile: string,
  nodeIds: string[],
  outputDir: string,
  log: (msg: string) => void
): Promise<void> {
  mkdirSync(outputDir, { recursive: true })
  const exportCmd = `export_nodes({ nodeIds: ${JSON.stringify(
    nodeIds
  )}, outputDir: ${JSON.stringify(outputDir)}, format: "png" })`
  const { code, stderr } = await runPenInteractive(penFile, [
    exportCmd,
    'exit()',
  ])
  if (code !== 0) {
    throw new Error(`export_nodes failed (code ${code}): ${stderr}`)
  }
  log(`Exported ${nodeIds.length} screen(s) as PNG to ${outputDir}`)
}

async function exportScreensHTML(
  penFile: string,
  screens: ScreenInfo[],
  outputDir: string,
  log: (msg: string) => void
): Promise<void> {
  mkdirSync(outputDir, { recursive: true })
  for (const screen of screens) {
    const outputPath = resolve(outputDir, `${sanitizeName(screen.name)}.html`)
    const exportCmd = `export_html({ nodeIds: ${JSON.stringify([
      screen.id,
    ])}, outputPath: ${JSON.stringify(outputPath)}, format: "html-tailwind" })`
    const stdoutFile = resolve(outputDir, `.pen-lint-stdout-${screen.id}.txt`)
    const { code, stdout, stderr } = await runPenInteractive(
      penFile,
      [exportCmd, 'exit()'],
      { stdoutFile }
    )
    rmSync(stdoutFile, { force: true })
    if (code !== 0) {
      throw new Error(
        `export_html failed for ${screen.name} (code ${code}): ${stderr}`
      )
    }
    const response = extractJsonResponse(stdout)
    const html =
      response && typeof response === 'object' && 'html' in response
        ? String((response as Record<string, unknown>).html)
        : null
    if (!html) {
      throw new Error(`export_html returned no html for ${screen.name}`)
    }
    writeFileSync(outputPath, html)
    log(`Exported ${screen.name} -> ${outputPath}`)
  }
}

export async function runExport(options: RunOptions = {}): Promise<number> {
  const penFile = options.penFile ?? PEN_FILE
  const catalogOutput = options.catalogOutput ?? CATALOG_OUTPUT
  const exportDir = options.exportDir ?? EXPORT_DIR
  const log = options.log ?? ((msg: string) => console.error(msg))

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }
  const screens = extractScreens(pen)
  if (screens.length === 0) {
    log('No screen frames found — nothing to export.')
    return 0
  }

  try {
    await exportScreensPNG(
      penFile,
      screens.map(s => s.id),
      exportDir,
      log
    )
    await exportScreensHTML(penFile, screens, exportDir, log)
    writeCatalog(pen, catalogOutput, log)
    return 0
  } catch (err) {
    log(`ERROR: ${String(err)}`)
    return 1
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.error(`pen-lint — deterministic pen -> code sync (REP-1618)

Usage:
  tsx scripts/pen-lint.ts                 Check mode (default): validate master
                                          naming against package exports, write
                                          the catalog + screens index to
                                          tmp/pen-catalog.json. Exit non-zero on
                                          violations.
  tsx scripts/pen-lint.ts --dry-run       List required resolutions as JSON on
  [--select id=pkg::Name,...]             stdout without touching repro.pen.
                                          Exit 0 iff every master is resolvable.
  tsx scripts/pen-lint.ts --apply         Apply mode: rename masters to
  [--select id=pkg::Name,...]             package::ComponentName, set metadata,
                                          save repro.pen. Confirmation prompt for
                                          ambiguous masters in a TTY; JSON
                                          candidate list on stdout otherwise.
  tsx scripts/pen-lint.ts --export        Export mode: screens to PNG + HTML and
                                          regenerate the catalog + screens index.
  tsx scripts/pen-lint.ts --help          Show this help.

Exit codes:
  0  clean / all masters resolved
  1  violations or unresolved masters

JSON contract (--dry-run, non-TTY --apply):
  { "mode": "dry-run", "clean": bool, "resolved": n, "unresolved": n,
    "invalidSelect": [ ... ], "masters": [ { "masterId", "masterName",
      "status", "proposedName"?, "candidates"?, "closestMatches"?,
      "reason"? } ] }
  status: conforming | auto | select | ambiguous | no-candidate | violation`)
}

/** Parse "--select m1=pkg::Name,m2=pkg::Name" into { masterId: name }. */
export function parseSelectArg(args: string[]): Record<string, string> {
  const idx = args.indexOf('--select')
  if (idx === -1 || idx + 1 >= args.length) return {}
  const raw = args[idx + 1]!
  const result: Record<string, string> = {}
  for (const part of raw.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const id = part.slice(0, eq).trim()
    const name = part.slice(eq + 1).trim()
    if (id && name) result[id] = name
  }
  return result
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }
  const select = parseSelectArg(args)
  if (args.includes('--dry-run')) {
    process.exit(runDryRun({ select }))
  }
  if (args.includes('--apply')) {
    process.exit(await runApply({ select }))
  }
  if (args.includes('--export')) {
    process.exit(await runExport())
  }
  process.exit(runCheck())
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  void main()
}
