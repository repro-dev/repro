#!/usr/bin/env node
// REP-1622: restructure repro.pen into native Group nodes (directory model).
//
// Flat -> grouped, deterministically:
//   - Masters  -> masters/<pkg>/           (pkg from metadata.package)
//   - Screens  -> screens/<surface>/<family>
//       surface: name prefix ('Admin:' -> admin, 'Screen:' -> demo)
//       family:  kebab-case of the normalized screen name; the
//                'Admin: State: Empty/Loading/Error' stubs join the health
//                family so the real pen has one full state family.
//   - Every screen gets { type: 'screen', stateFamily, state } metadata
//       (state in the closed enum content|loading|empty|error).
//   - Group ids are deterministic UUIDv5 hashes of the group path, so two
//     runs on the same input produce byte-identical output (idempotent:
//     an already-grouped file is returned unchanged).
//
// Flags:
//   --pen-file <p>   use <p> instead of repro.pen
//   --drop-stubs     drop the 'Admin: State: *' stubs instead of migrating
//                    them into the health family
//   --dry-run        print the migrated JSON to stdout, write nothing
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PenFile, PenNode } from './pen-lint.ts'
import { parsePenJson, REPO_ROOT, uuidv5 } from './pen-lint.ts'

export const PEN_FILE = resolve(REPO_ROOT, 'repro.pen')

export interface MigrateOptions {
  penFile?: string
  dropStubs?: boolean
  dryRun?: boolean
  log?: (msg: string) => void
}

// ---------------------------------------------------------------------------
// Screen classification
// ---------------------------------------------------------------------------

const STATE_STUB_RE = /^Admin: State: (Empty|Loading|Error)$/

function kebabCase(name: string): string {
  const cleaned = name.replaceAll(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.toLowerCase() || 'unnamed'
}

function surfaceForName(name: string): string {
  if (name.startsWith('Admin:')) return 'admin'
  if (name.startsWith('Screen:')) return 'demo'
  const prefix = name.split(':')[0]!.trim().toLowerCase()
  return prefix || 'misc'
}

export interface ScreenClassification {
  surface: string
  family: string
  state: 'content' | 'loading' | 'empty' | 'error'
}

export function classifyScreen(name: string): ScreenClassification {
  const stub = STATE_STUB_RE.exec(name)
  if (stub) {
    return {
      surface: 'admin',
      family: 'health',
      state: stub[1]!.toLowerCase() as 'loading' | 'empty' | 'error',
    }
  }
  const normalized = name.replace(/^(Admin|Screen):\s*/, '')
  return {
    surface: surfaceForName(name),
    family: kebabCase(normalized),
    state: 'content',
  }
}

/** Deterministic group node for a path segment. */
function groupNode(name: string, groupPath: string): PenNode {
  return {
    type: 'group',
    id: uuidv5(groupPath),
    name,
    x: 0,
    y: 0,
    children: [],
  }
}

function masterPkg(master: PenNode): string | null {
  const metadata =
    master.metadata && typeof master.metadata === 'object'
      ? (master.metadata as Record<string, string>)
      : undefined
  if (metadata?.package) return metadata.package
  const idx = master.name.indexOf('::')
  if (idx !== -1) return master.name.slice(0, idx)
  return null
}

/**
 * Flat -> grouped transform. Idempotent: a file that already contains group
 * nodes is returned unchanged (running twice yields the same bytes).
 */
export function migratePenGroups(
  pen: PenFile,
  options: { dropStubs?: boolean } = {}
): PenFile {
  if (pen.children.some(child => child.type === 'group')) return pen

  const masters = pen.children.filter(
    child => child.type === 'frame' && child.reusable === true
  )
  const screens = pen.children.filter(
    child => child.type === 'frame' && !child.reusable
  )
  const other = pen.children.filter(child => child.type !== 'frame')

  // Names become pure human labels: strip the retired package::Component
  // prefix. Identity now comes from the group path (masters/<pkg>) and the
  // component label must be the exported symbol name ('Button', not
  // 'design::Button').
  for (const master of masters) {
    if (master.name.includes('::')) {
      master.name = master.name.split('::').pop() as string
    }
  }

  const mastersGroup = groupNode('masters', 'masters')
  const byPkg = new Map<string, PenNode[]>()
  const ungroupedMasters: PenNode[] = []
  for (const master of masters) {
    const pkg = masterPkg(master)
    if (pkg) {
      const list = byPkg.get(pkg) ?? []
      list.push(master)
      byPkg.set(pkg, list)
    } else {
      ungroupedMasters.push(master)
    }
  }
  for (const pkg of [...byPkg.keys()].sort()) {
    const pkgGroup = groupNode(pkg, `masters/${pkg}`)
    pkgGroup.children = byPkg.get(pkg)!
    mastersGroup.children!.push(pkgGroup)
  }
  mastersGroup.children!.push(...ungroupedMasters)

  const screensGroup = groupNode('screens', 'screens')
  const byFamily = new Map<string, PenNode[]>()
  for (const screen of screens) {
    const classified = classifyScreen(screen.name)
    if (options.dropStubs && classified.state !== 'content') continue
    screen.metadata = {
      type: 'screen',
      stateFamily: `screens/${classified.surface}/${classified.family}`,
      state: classified.state,
    }
    const key = `${classified.surface}/${classified.family}`
    const list = byFamily.get(key) ?? []
    list.push(screen)
    byFamily.set(key, list)
  }
  for (const key of [...byFamily.keys()].sort()) {
    const [surface, family] = key.split('/') as [string, string]
    let surfaceGroup = screensGroup.children!.find(
      child => child.name === surface
    ) as PenNode | undefined
    if (!surfaceGroup) {
      surfaceGroup = groupNode(surface, `screens/${surface}`)
      screensGroup.children!.push(surfaceGroup)
    }
    const familyGroup = groupNode(family, `screens/${key}`)
    familyGroup.children = byFamily.get(key)!
    surfaceGroup.children!.push(familyGroup)
  }

  pen.children = [mastersGroup, screensGroup, ...other]
  return pen
}

function main(): void {
  const args = process.argv.slice(2)
  const penFile = args[args.indexOf('--pen-file') + 1] ?? PEN_FILE
  const dropStubs = args.includes('--drop-stubs')
  const dryRun = args.includes('--dry-run')

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    console.error(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    process.exit(1)
  }

  const migrated = migratePenGroups(pen, { dropStubs })
  const output = JSON.stringify(migrated, null, 2) + '\n'
  if (dryRun) {
    process.stdout.write(output)
    process.exit(0)
  }
  if (readFileSync(penFile, 'utf8') === output) {
    console.error(`${penFile} is already in the group model — no changes.`)
    process.exit(0)
  }
  writeFileSync(penFile, output)
  console.error(
    `Migrated ${penFile} to the group model (masters/<pkg>/, screens/<surface>/<family>).`
  )
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main()
}
