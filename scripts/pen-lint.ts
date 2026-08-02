#!/usr/bin/env node
// REP-1620: deterministic pen -> code sync CLI.
//
// Replaces LLM-dependent pen -> code translation with a deterministic gate:
//   - Check mode (default): read-only validation of conventions against
//     repro.pen. Exits 0 when clean, non-zero on violations. Used as a
//     pre-push hook.
//   - Apply mode (--apply): renames masters to package::ComponentName,
//     writes metadata on every master, and saves repro.pen. Exits non-zero
//     for issues it cannot auto-fix.
//   - Export mode (--export): exports screens to PNG + HTML via the pen CLI
//     and regenerates the screens index in pen-component-map.json.
//
// Naming rules (see pen-component-map.json header):
//   - Master name: <package>::<ComponentName>, e.g. design::Button.
//   - The component-map KEY is the canonical component name. The `code`
//     field carries the actual code reference ("@repro/<pkg> <Token>").
//     Export validation resolves the code token (AdminTable maps to the
//     Table export), while the master name uses the map key so names stay
//     unique and resolvable back to the registry.
import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..')
export const PEN_FILE = resolve(REPO_ROOT, 'repro.pen')
export const COMPONENT_MAP_FILE = resolve(REPO_ROOT, 'pen-component-map.json')
export const CATALOG_OUTPUT = resolve(REPO_ROOT, 'tmp/pen-catalog.json')
export const EXPORT_DIR = resolve(REPO_ROOT, 'tmp/pen-screens')

export interface PenNode {
  type: string
  id: string
  name: string
  reusable?: boolean
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

export interface ComponentMapEntry {
  masterId: string
  code: string
  [key: string]: unknown
}

export interface ComponentMap {
  components: Record<string, ComponentMapEntry>
  screens?: Record<string, string>
  [key: string]: unknown
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

const MASTER_NAME_PATTERN = /^[a-z][a-z0-9-]*::[A-Z][a-zA-Z0-9]*$/

/** Masters follow package::ComponentName (:: as namespace separator). */
export function validateMasterName(name: string): boolean {
  return MASTER_NAME_PATTERN.test(name)
}

/** Parse "@repro/<pkg> <Token> (notes)" into { pkg, comp }. */
export function determinePackagePrefix(
  code: string
): { pkg: string; comp: string } | null {
  const match = /^@repro\/([a-z0-9-]+)\s+([A-Za-z0-9_]+)/.exec(code)
  if (!match) return null
  return { pkg: match[1]!, comp: match[2]! }
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
// Catalog (Phase 1) — runs in check and apply modes
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
  const catalog = {
    masters: extractMasters(pen),
    screens: extractScreens(pen),
    variables: extractVariables(pen),
  }
  writeFileSync(catalogOutput, JSON.stringify(catalog, null, 2) + '\n')
  log(`Catalog written to ${catalogOutput}`)
}

// ---------------------------------------------------------------------------
// Check mode (Phase 2)
// ---------------------------------------------------------------------------

export interface RunOptions {
  penFile?: string
  componentMapFile?: string
  catalogOutput?: string
  exportDir?: string
  log?: (msg: string) => void
}

export function runCheck(options: RunOptions = {}): number {
  const penFile = options.penFile ?? PEN_FILE
  const componentMapFile = options.componentMapFile ?? COMPONENT_MAP_FILE
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

  // Load the component map for name/export expectations.
  let componentMap: ComponentMap = { components: {} }
  if (existsSync(componentMapFile)) {
    componentMap = JSON.parse(
      readFileSync(componentMapFile, 'utf8')
    ) as ComponentMap
  } else {
    violations.push(`component map missing: ${componentMapFile}`)
  }

  const masterIds = new Set(
    Object.values(componentMap.components).map(c => c.masterId)
  )

  for (const master of masters) {
    const entry = Object.entries(componentMap.components).find(
      ([, value]) => value.masterId === master.id
    )
    if (entry) {
      const [mapKey, value] = entry
      const parsed = determinePackagePrefix(value.code)
      const expected = parsed ? `${parsed.pkg}::${mapKey}` : null
      if (expected && master.name !== expected) {
        violations.push(
          `master ${master.id} "${master.name}" should be named ${expected}`
        )
      }
      if (!parsed) {
        violations.push(
          `master ${master.id} "${master.name}": code field "${value.code}" is not @repro/<pkg> <Token>`
        )
        continue
      }
      if (!resolvePackagePath(parsed.pkg)) {
        violations.push(
          `master ${master.id}: package "${parsed.pkg}" does not exist`
        )
      }
      if (!checkComponentExport(parsed.pkg, parsed.comp)) {
        violations.push(
          `master ${master.id}: "${parsed.comp}" is not exported from @repro/${parsed.pkg}`
        )
      }
      continue
    }

    // No component-map entry: fall back to pattern + resolvability checks.
    if (!validateMasterName(master.name)) {
      violations.push(
        `master ${master.id} "${master.name}" violates package::ComponentName`
      )
    } else {
      const [pkg] = master.name.split('::') as [string, string]
      if (!resolvePackagePath(pkg)) {
        violations.push(`master ${master.id}: package "${pkg}" does not exist`)
      }
    }
  }

  // Component-map entries that have no master in the pen are fine (noMaster
  // components), but masters without an entry are drift.
  for (const master of masters) {
    if (!masterIds.has(master.id)) {
      violations.push(
        `master ${master.id} "${master.name}" has no pen-component-map.json entry`
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
// Apply mode (Phase 3)
// ---------------------------------------------------------------------------

export function runApply(options: RunOptions = {}): number {
  const penFile = options.penFile ?? PEN_FILE
  const componentMapFile = options.componentMapFile ?? COMPONENT_MAP_FILE
  const log = options.log ?? ((msg: string) => console.error(msg))

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }

  let componentMap: ComponentMap
  try {
    componentMap = JSON.parse(
      readFileSync(componentMapFile, 'utf8')
    ) as ComponentMap
  } catch (err) {
    log(
      `ERROR: failed to read component map ${componentMapFile}: ${String(err)}`
    )
    return 1
  }

  const masters = extractMasters(pen)
  const unfixable: string[] = []
  let renamed = 0

  for (const master of masters) {
    const entry = Object.entries(componentMap.components).find(
      ([, value]) => value.masterId === master.id
    )
    if (!entry) {
      unfixable.push(
        `master ${master.id} "${master.name}" has no pen-component-map.json entry`
      )
      continue
    }
    const [mapKey, value] = entry
    const parsed = determinePackagePrefix(value.code)
    if (!parsed) {
      unfixable.push(
        `master ${master.id} "${master.name}": code field "${value.code}" is not @repro/<pkg> <Token>`
      )
      continue
    }
    if (!resolvePackagePath(parsed.pkg)) {
      unfixable.push(
        `master ${master.id}: package "${parsed.pkg}" does not exist`
      )
    }
    if (!checkComponentExport(parsed.pkg, parsed.comp)) {
      unfixable.push(
        `master ${master.id}: "${parsed.comp}" is not exported from @repro/${parsed.pkg}`
      )
    }

    const expected = `${parsed.pkg}::${mapKey}`
    const node = pen.children.find(child => child.id === master.id)
    if (!node) continue
    if (node.name !== expected) {
      log(`renaming master ${master.id} "${node.name}" -> ${expected}`)
      node.name = expected
      renamed++
    }
    node.metadata = {
      type: 'component-map',
      package: parsed.pkg,
      component: mapKey,
    }
  }

  if (unfixable.length > 0) {
    for (const issue of unfixable) log(`unfixable: ${issue}`)
    // Save the fixable part anyway so partial progress is not lost.
    writeFileSync(penFile, JSON.stringify(pen, null, 2) + '\n')
    log(`${unfixable.length} unfixable issue(s) require manual intervention.`)
    return 1
  }

  writeFileSync(penFile, JSON.stringify(pen, null, 2) + '\n')
  if (renamed > 0) {
    log(`Applied ${renamed} master rename(s) and metadata to ${penFile}`)
  } else {
    log(`pen file already conforming — no changes (${penFile})`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// Export mode (Phase 4)
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

/** Index of the closing brace matching the brace at <open>, string-aware. */
function matchingBrace(text: string, open: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!
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
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Replace only the "screens" object in pen-component-map.json, preserving the
 * file's compact formatting for everything else.
 */
function writeScreensIndex(
  componentMapFile: string,
  screens: ScreenInfo[],
  log: (msg: string) => void
): void {
  const raw = readFileSync(componentMapFile, 'utf8')
  const marker = '"screens":'
  const keyIdx = raw.indexOf(marker)
  if (keyIdx === -1) {
    throw new Error(`${componentMapFile} has no "screens" key`)
  }
  const braceOpen = raw.indexOf('{', keyIdx + marker.length)
  if (braceOpen === -1) {
    throw new Error(`${componentMapFile}: cannot locate screens object`)
  }
  const braceClose = matchingBrace(raw, braceOpen)
  if (braceClose === -1) {
    throw new Error(`${componentMapFile}: malformed screens object`)
  }
  const entries = Object.entries(buildScreensIndex(screens))
    .map(([name, id]) => `    ${JSON.stringify(name)}: ${JSON.stringify(id)}`)
    .join(',\n')
  const replacement = `"screens": {\n${entries}\n  }`
  const updated = raw.slice(0, keyIdx) + replacement + raw.slice(braceClose + 1)
  writeFileSync(componentMapFile, updated)
  log(`Screens index written to ${componentMapFile}`)
}

export async function runExport(options: RunOptions = {}): Promise<number> {
  const penFile = options.penFile ?? PEN_FILE
  const componentMapFile = options.componentMapFile ?? COMPONENT_MAP_FILE
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
    writeScreensIndex(componentMapFile, screens, log)
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
  console.error(`pen-lint — deterministic pen -> code sync (REP-1620)

Usage:
  tsx scripts/pen-lint.ts               Check mode (default): validate repro.pen
                                        conventions, exit non-zero on violations.
  tsx scripts/pen-lint.ts --apply       Apply mode: rename masters to
                                        package::ComponentName, set metadata,
                                        save repro.pen. Non-zero if unfixable.
  tsx scripts/pen-lint.ts --export      Export mode: screens to PNG + HTML and
                                        regenerate pen-component-map.json screens.
  tsx scripts/pen-lint.ts --help        Show this help.`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }
  if (args.includes('--apply')) {
    process.exit(runApply())
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
