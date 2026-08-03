#!/usr/bin/env node
// REP-1618/REP-1622: deterministic pen -> code sync CLI (directory/group model).
//
// repro.pen is restructured into native Group nodes (REP-1622):
//   masters/<pkg>/<Component>   — master identity comes from the PATH
//   screens/<surface>/<family>  — screens grouped by surface + state family
// Names are pure human labels; the package::Component name prefix and
// MASTER_NAME_PATTERN/splitMasterName name parsing are retired.
//
// Modes:
//   - Check mode (default): read-only validation of path-based master
//     resolution, export resolvability, state-family metadata, and variable
//     refs against repro.pen. Exits 0 when clean, non-zero on violations.
//   - Dry-run mode (--dry-run): lists every required resolution as machine
//     JSON on stdout (candidate ranking per master) without touching the
//     pen file. Exit 0 iff every master is resolvable.
//   - Apply mode (--apply): repair mode — moves a master frame into the
//     correct masters/<pkg>/ group and writes { type: 'master', package,
//     component } metadata (no renames; names are labels now). Single-
//     candidate masters auto-repair; ambiguous masters prompt in a TTY or
//     emit JSON + exit non-zero otherwise.
//   - Export mode (--export): exports screens to PNG + HTML via the pen CLI
//     and regenerates the catalog (with the screens index) in
//     tmp/pen-catalog.json.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  children?: PenNode[]
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
  themes?: unknown
  [key: string]: unknown
}

export interface MasterInfo {
  id: string
  name: string
  dims: Record<string, unknown>
  variableRefs: string[]
  metadata?: Record<string, string>
  /** Path of the containing groups ('' for top-level), e.g. 'masters/design'. */
  groupPath: string
}

export const SCREEN_STATES = ['content', 'loading', 'empty', 'error'] as const
export type ScreenState = (typeof SCREEN_STATES)[number]

export interface ScreenInfo {
  id: string
  name: string
  normalizedName: string
  width?: unknown
  height?: unknown
  /** Path of the containing groups ('' for top-level), e.g. 'screens/admin/health'. */
  groupPath: string
  /** Declarative state-family association (metadata authoritative). */
  stateFamily?: string
  /** Raw metadata.state value; validated against the closed enum separately. */
  state?: string
}

export interface LocatedNode {
  node: PenNode
  groupPath: string
  /**
   * True when the node's direct parent is a Group node or the document root
   * AND no frame is an ancestor. Collection-level frames are masters/screens;
   * frames nested inside other frames (a screen's internal layout, a master's
   * own children — even via an intermediate group) are not.
   */
  atCollectionLevel: boolean
}

export interface StateViolation {
  /**
   * Null for family-scoped violations (e.g. "has no content screen") where
   * no single screen is responsible; per-screen violations carry the id.
   * Never an empty-string sentinel.
   */
  screenId: string | null
  screenName: string | null
  reason: string
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

/**
 * Depth-first walk of every node in the tree (groups, frames, refs, texts,
 * icons, ...). Group nodes carry no payload of their own, so recursive
 * extraction and validation must see inside them.
 */
export function findNodesRecursive(nodes: PenNode[]): PenNode[] {
  const result: PenNode[] = []
  const visit = (node: PenNode): void => {
    result.push(node)
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child)
    }
  }
  for (const node of nodes) visit(node)
  return result
}

/**
 * Depth-first walk that also carries the path of containing group names
 * (joined with '/', '' for top-level nodes). Group names are path segments;
 * a frame inside `masters` > `design` has groupPath 'masters/design'.
 */
export function findNodesRecursiveWithPath(nodes: PenNode[]): LocatedNode[] {
  const result: LocatedNode[] = []
  const segments: string[] = []
  const visit = (
    node: PenNode,
    parentIsGroup: boolean,
    insideFrame: boolean
  ): void => {
    result.push({
      node,
      groupPath: segments.join('/'),
      atCollectionLevel: parentIsGroup && !insideFrame,
    })
    if (Array.isArray(node.children)) {
      if (node.type === 'group' && typeof node.name === 'string') {
        segments.push(node.name)
      }
      const nextParentIsGroup = node.type === 'group'
      const nextInsideFrame = insideFrame || node.type === 'frame'
      for (const child of node.children) {
        visit(child, nextParentIsGroup, nextInsideFrame)
      }
      if (node.type === 'group' && typeof node.name === 'string') {
        segments.pop()
      }
    }
  }
  for (const node of nodes) visit(node, true, false)
  return result
}

/**
 * Deterministic group id: UUIDv5 (SHA-1) of the group path string under the
 * DNS namespace. Same input -> same id, so group structure is reproducible
 * and idempotent migrations keep stable ids.
 */
const UUIDV5_DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

export function uuidv5(
  name: string,
  namespace: string = UUIDV5_DNS_NAMESPACE
): string {
  const nsBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex')
  const hash = createHash('sha1')
  hash.update(nsBytes)
  hash.update(name, 'utf8')
  const bytes = hash.digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant 10xx
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Reusable collection-level frames are the masters (inside groups or top-level). */
export function extractMasters(pen: PenFile): MasterInfo[] {
  return findNodesRecursiveWithPath(pen.children)
    .filter(
      ({ node, atCollectionLevel }) =>
        node.type === 'frame' && node.reusable === true && atCollectionLevel
    )
    .map(({ node, groupPath }) => {
      const dims: Record<string, unknown> = {}
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        if (node[key] !== undefined) dims[key] = node[key]
      }
      return {
        id: node.id,
        name: node.name,
        dims,
        variableRefs: [...extractVariableRefs(node)].sort(),
        metadata:
          node.metadata && typeof node.metadata === 'object'
            ? (node.metadata as Record<string, string>)
            : undefined,
        groupPath,
      }
    })
}

/**
 * Non-reusable collection-level frames are the screens. Screens live only
 * under `screens/` (or at the top level for backward-compatible fixtures);
 * anything inside a master's subtree (path starts with 'masters') is never
 * a screen, and frames nested inside other frames (a screen's internal
 * layout) are not screens either.
 */
export function extractScreens(pen: PenFile): ScreenInfo[] {
  return findNodesRecursiveWithPath(pen.children)
    .filter(
      ({ node, groupPath, atCollectionLevel }) =>
        node.type === 'frame' &&
        !node.reusable &&
        atCollectionLevel &&
        groupPath.split('/')[0] !== 'masters'
    )
    .map(({ node, groupPath }) => {
      const metadata =
        node.metadata && typeof node.metadata === 'object'
          ? (node.metadata as Record<string, string>)
          : undefined
      return {
        id: node.id,
        name: node.name,
        normalizedName: normalizeScreenName(node.name),
        width: node.width,
        height: node.height,
        groupPath,
        stateFamily: metadata?.stateFamily,
        state: metadata?.state,
      }
    })
}

export function extractVariables(pen: PenFile): Record<string, PenVariable> {
  return pen.variables ?? {}
}

/** True when the value is one of the closed screen-state values. */
export function isScreenState(value: unknown): value is ScreenState {
  return (
    typeof value === 'string' &&
    (SCREEN_STATES as readonly string[]).includes(value)
  )
}

export type StateFamilyMap = Map<
  string,
  Partial<Record<ScreenState, { screenId: string; screenName: string }>>
>

/**
 * Group screens by their declarative stateFamily metadata. First screen wins
 * when a state value is duplicated (the duplicate is reported separately by
 * validateStateFamilies). Non-enum states are excluded (they are violations,
 * not family members).
 */
export function extractStateFamilies(screens: ScreenInfo[]): StateFamilyMap {
  const families: StateFamilyMap = new Map()
  for (const screen of screens) {
    if (!screen.stateFamily || !screen.state) continue
    if (!isScreenState(screen.state)) continue
    let entry = families.get(screen.stateFamily)
    if (!entry) {
      entry = {}
      families.set(screen.stateFamily, entry)
    }
    if (entry[screen.state] === undefined) {
      entry[screen.state] = { screenId: screen.id, screenName: screen.name }
    }
  }
  return families
}

/**
 * Per-screen state metadata validation (violations exit non-zero):
 *   - `state` must be in the closed enum
 *   - `stateFamily` and `state` always together (both-or-neither)
 *
 * These are properties of each screen itself and must run even for scoped
 * runs (e.g. pen-contract --screen), where family aggregates cannot be
 * evaluated on a filtered screen set.
 */
export function validateScreenStateMetadata(
  screens: ScreenInfo[]
): StateViolation[] {
  const violations: StateViolation[] = []
  for (const screen of screens) {
    const hasFamily = screen.stateFamily !== undefined
    const hasState = screen.state !== undefined
    if (hasFamily !== hasState) {
      violations.push({
        screenId: screen.id,
        screenName: screen.name,
        reason: hasFamily
          ? `screen has stateFamily "${screen.stateFamily}" but no state (stateFamily and state must be set together)`
          : `screen has state "${String(
              screen.state
            )}" but no stateFamily (stateFamily and state must be set together)`,
      })
      continue
    }
    if (hasState && !isScreenState(screen.state)) {
      violations.push({
        screenId: screen.id,
        screenName: screen.name,
        reason: `invalid state "${String(
          screen.state
        )}" — expected one of ${SCREEN_STATES.join(', ')}`,
      })
    }
  }
  return violations
}

/**
 * Family-aggregate state validation (violations exit non-zero):
 *   - within a family, states are unique
 *   - within a family, exactly one screen is the content state
 *
 * These span the family's whole screen set and are only meaningful on the
 * full set (scoped --screen runs skip them to avoid false "no content
 * screen" violations on a filtered subset).
 */
export function validateFamilyStateAggregates(
  screens: ScreenInfo[]
): StateViolation[] {
  const violations: StateViolation[] = []
  const familyScreens = new Map<string, ScreenInfo[]>()

  // Only enum-valid states join the family's screen set. Non-enum states
  // are reported as invalid-state violations (validateScreenStateMetadata)
  // and are excluded from duplicate/content counting so a family violation
  // never references a screen the contract's stateFamilies output does not
  // show (this mirrors extractStateFamilies, which skips non-enum states).
  for (const screen of screens) {
    if (screen.stateFamily && isScreenState(screen.state)) {
      const list = familyScreens.get(screen.stateFamily) ?? []
      list.push(screen)
      familyScreens.set(screen.stateFamily, list)
    }
  }

  for (const [family, list] of [...familyScreens.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const contents = list.filter(s => s.state === 'content')
    if (contents.length === 0) {
      violations.push({
        screenId: null,
        screenName: null,
        reason: `state family "${family}" has no content screen — exactly one content state is required`,
      })
    } else if (contents.length > 1) {
      violations.push({
        screenId: null,
        screenName: null,
        reason: `state family "${family}" has ${contents.length} content screens — exactly one is required`,
      })
    }
    const seen = new Map<string, string>()
    for (const screen of list) {
      if (!screen.state) continue
      const prior = seen.get(screen.state)
      if (prior !== undefined) {
        violations.push({
          screenId: screen.id,
          screenName: screen.name,
          reason: `duplicate state "${screen.state}" in family "${family}" (also used by screen "${prior}")`,
        })
      } else {
        seen.set(screen.state, screen.name)
      }
    }
  }
  return violations
}

/**
 * Strict state-family validation (violations exit non-zero): per-screen
 * metadata (enum membership, both-or-neither) plus family aggregates
 * (unique states, exactly one content). The two halves are exposed
 * separately so scoped runs can skip the family aggregates.
 */
export function validateStateFamilies(screens: ScreenInfo[]): StateViolation[] {
  return [
    ...validateScreenStateMetadata(screens),
    ...validateFamilyStateAggregates(screens),
  ]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * @deprecated name-based convention (REP-1622): master identity now comes
 * from the group path. Kept as an internal helper for candidate inference
 * only — nothing should import it.
 */
const MASTER_NAME_PATTERN = /^[a-z][a-z0-9-]*::[A-Z][a-zA-Z0-9]*$/

function validateMasterName(name: string): boolean {
  return MASTER_NAME_PATTERN.test(name)
}

/** Split "pkg::Component" into [pkg, Component]. */
function splitMasterName(name: string): [string, string] {
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
  for (const node of findNodesRecursive(pen.children)) {
    for (const ref of extractVariableRefs(node)) used.add(ref)
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
    const frame = findNodeByIdRecursive(pen, screen.id)
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
 * Suggest package::ComponentName bindings for a master's component label.
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
// Path-based master resolution
// ---------------------------------------------------------------------------

export interface MasterResolutionOk {
  ok: true
  pkg: string
  comp: string
}

export interface MasterResolutionFailure {
  ok: false
  reason: string
  candidates: string[]
  /** The master sits in a well-formed masters/<pkg> group (path shape is right). */
  pathConforming: boolean
}

export type MasterResolution = MasterResolutionOk | MasterResolutionFailure

function failureCandidates(
  inference: ReturnType<typeof inferCandidates>
): string[] {
  if (inference.exact.length > 0) return inference.exact
  return inference.closest.map(c => `${c.package}::${c.component}`)
}

/**
 * Resolve a master to a concrete @repro/<pkg> export from its GROUP PATH
 * (identity comes from `masters/<pkg>`, not the name). The component label
 * is the frame name. Anything that cannot resolve reports "did you mean?"
 * candidates via inferCandidates.
 */
export function resolveMasterFromPath(
  groupPath: string,
  name: string,
  exportsByPackage: Map<string, Set<string>>
): MasterResolution {
  const segments = groupPath.split('/').filter(Boolean)
  if (segments[0] !== 'masters' || segments.length !== 2) {
    return {
      ok: false,
      reason: `master "${name}" is not inside a masters/<pkg> group (group path "${groupPath}")`,
      candidates: failureCandidates(inferCandidates(name, exportsByPackage)),
      pathConforming: false,
    }
  }
  const pkg = segments[1]!
  if (!resolvePackagePath(pkg)) {
    return {
      ok: false,
      reason: `package "${pkg}" does not exist`,
      candidates: [],
      pathConforming: true,
    }
  }
  const ex = exportsByPackage.get(pkg)
  if (!ex || !ex.has(name)) {
    return {
      ok: false,
      reason: `"${name}" is not exported from @repro/${pkg}`,
      candidates: failureCandidates(inferCandidates(name, exportsByPackage)),
      pathConforming: true,
    }
  }
  return { ok: true, pkg, comp: name }
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
 * decide whether it conforms (path resolves), can be auto-repaired, needs
 * --select, is ambiguous, has no candidate, or is a violation.
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

    const resolution = resolveMasterFromPath(
      master.groupPath,
      master.name,
      exportsByPackage
    )
    if (resolution.ok) {
      entries.push({
        masterId: master.id,
        masterName: master.name,
        status: 'conforming',
      })
      resolved++
      continue
    }
    if (resolution.pathConforming) {
      entries.push({
        masterId: master.id,
        masterName: master.name,
        status: 'violation',
        reason: resolution.reason,
        candidates:
          resolution.candidates.length > 0
            ? resolution.candidates.map(toCandidate)
            : undefined,
      })
      unresolved++
      continue
    }

    // Master is not inside a valid masters/<pkg> group: infer a repair.
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

function toCandidate(qualified: string): CandidateInfo {
  const [pkg, comp] = splitMasterName(qualified)
  return { package: pkg, component: comp, confidence: 'exact' }
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
  const screens = extractScreens(pen)
  const exportsByPackage = collectAllPackageExports()

  for (const master of masters) {
    const resolution = resolveMasterFromPath(
      master.groupPath,
      master.name,
      exportsByPackage
    )
    if (resolution.ok) continue
    if (resolution.pathConforming) {
      if (resolution.candidates.length > 0) {
        violations.push(
          `master ${master.id} "${master.name}": ${
            resolution.reason
          } — did you mean ${resolution.candidates
            .map(c => `\`${c}\``)
            .join(', ')}?`
        )
      } else {
        violations.push(
          `master ${master.id} "${master.name}": ${resolution.reason}`
        )
      }
      continue
    }
    // Not inside a masters/<pkg> group: recommend candidates, never a command.
    const inference = inferCandidates(master.name, exportsByPackage)
    if (inference.exact.length === 1) {
      violations.push(
        `master ${master.id} "${master.name}" is not inside a masters/<pkg> group — did you mean \`${inference.exact[0]}\`? Run 'tsx scripts/pen-lint.ts --apply' to move it.`
      )
    } else if (inference.exact.length > 1) {
      const options = inference.exact.map(n => `\`${n}\``).join(', ')
      violations.push(
        `master ${master.id} "${master.name}" is not inside a masters/<pkg> group — did you mean one of ${options}?`
      )
    } else {
      const matches = inference.closest
        .map(c => `\`${c.package}::${c.component}\``)
        .join(', ')
      violations.push(
        `master ${master.id} "${master.name}" is not inside a masters/<pkg> group and has no matching component export — closest matches: ${matches}. Flag for human resolution.`
      )
    }
  }

  // State-family metadata is part of the strict gate.
  for (const sv of validateStateFamilies(screens)) {
    violations.push(
      sv.screenId === null
        ? sv.reason
        : `screen ${sv.screenId} "${sv.screenName}": ${sv.reason}`
    )
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
      `${violations.length} violation(s) found — run 'tsx scripts/pen-lint.ts --apply' to auto-fix grouping/metadata.`
    )
    return 1
  }
  log(
    'pen-lint check passed: all masters, groups, packages, exports, state families, and variable refs are clean.'
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

/** Find the children array (at any depth) that directly contains the id. */
function findParentChildren(nodes: PenNode[], id: string): PenNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return nodes
    if (Array.isArray(node.children)) {
      const found = findParentChildren(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Walk a group path ('masters/design') creating any missing groups along the
 * way with deterministic UUIDv5 ids; returns the children array of the leaf.
 */
function getOrCreateGroup(pen: PenFile, groupPath: string): PenNode[] {
  const segments = groupPath.split('/').filter(Boolean)
  let current = pen.children
  let acc = ''
  for (const segment of segments) {
    acc = acc ? `${acc}/${segment}` : segment
    let group = current.find(c => c.type === 'group' && c.name === segment) as
      | PenNode
      | undefined
    if (!group) {
      group = { type: 'group', id: uuidv5(acc), name: segment, x: 0, y: 0 }
      group.children = []
      current.push(group)
    }
    current = group.children ?? (group.children = [])
  }
  return current
}

/**
 * Move a node into a group path (creating groups as needed). No-op when the
 * node is already a direct child of the target group.
 */
function moveNodeToGroup(
  pen: PenFile,
  node: PenNode,
  groupPath: string,
  log: (msg: string) => void
): boolean {
  const parentChildren = findParentChildren(pen.children, node.id)
  if (!parentChildren) return false
  const targetChildren = getOrCreateGroup(pen, groupPath)
  if (parentChildren === targetChildren) return false
  const index = parentChildren.indexOf(node)
  parentChildren.splice(index, 1)
  targetChildren.push(node)
  log(`moving master ${node.id} "${node.name}" -> ${groupPath}/`)
  return true
}

/**
 * Set a master node's resolved-binding metadata. Returns true when the node
 * actually changed, so the pen file is only written when there is a diff.
 * Names are pure labels now — apply never renames.
 */
function applyBinding(node: PenNode, pkg: string, comp: string): boolean {
  let changed = false
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

/** Find a node by id anywhere in the tree (including inside groups). */
export function findNodeByIdRecursive(
  pen: PenFile,
  id: string
): PenNode | null {
  return findNodesRecursive(pen.children).find(node => node.id === id) ?? null
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
    const node = findNodeByIdRecursive(pen, master.id)
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
      // Both steps must run: `||` short-circuits, so compute both first.
      const moved = moveNodeToGroup(pen, node, `masters/${validation.pkg}`, log)
      const bound = applyBinding(node, validation.pkg, validation.comp)
      if (moved || bound) changed = true
      accepted++
      continue
    }

    const resolution = resolveMasterFromPath(
      master.groupPath,
      master.name,
      exportsByPackage
    )
    if (resolution.ok) {
      if (applyBinding(node, resolution.pkg, resolution.comp)) {
        changed = true
      }
      accepted++
      continue
    }
    if (resolution.pathConforming) {
      unresolved.push(
        `master ${master.id} "${master.name}": ${resolution.reason}`
      )
      continue
    }

    // Not inside a valid masters/<pkg> group: infer a repair target.
    const inference = inferCandidates(master.name, exportsByPackage)
    if (inference.exact.length === 1) {
      // Single unambiguous candidate -> auto-repair without prompting.
      const target = inference.exact[0]!
      const [pkg, comp] = splitMasterName(target)
      // Both steps must run: `||` short-circuits, so compute both first.
      const moved = moveNodeToGroup(pen, node, `masters/${pkg}`, log)
      const bound = applyBinding(node, pkg, comp)
      if (moved || bound) changed = true
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
          // Both steps must run: `||` short-circuits, so compute both first.
          const moved = moveNodeToGroup(pen, node, `masters/${pkg}`, log)
          const bound = applyBinding(node, pkg, comp)
          if (moved || bound) changed = true
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
    log(`Applied master grouping and metadata to ${penFile}`)
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
      pen.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
    }
    pen.stderr?.on('data', (data: Buffer) => {
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
    pen.stdin?.write(commands.join('\n'))
    pen.stdin?.end()
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
  console.error(`pen-lint — deterministic pen -> code sync (REP-1618/REP-1622)

Usage:
  tsx scripts/pen-lint.ts                 Check mode (default): validate path-
                                          based master resolution, state-family
                                          metadata, and variable refs; write the
                                          catalog + screens index to
                                          tmp/pen-catalog.json. Exit non-zero on
                                          violations.
  tsx scripts/pen-lint.ts --dry-run       List required resolutions as JSON on
  [--select id=pkg::Name,...]             stdout without touching repro.pen.
                                          Exit 0 iff every master is resolvable.
  tsx scripts/pen-lint.ts --apply         Apply mode: move masters into their
  [--select id=pkg::Name,...]             masters/<pkg>/ group and set metadata,
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
