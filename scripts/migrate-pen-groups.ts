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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
 * nodes AND no top-level flat frames is returned unchanged (running twice
 * yields the same bytes). A partially-migrated file (groups coexisting with
 * flat frames) folds the flat frames into the existing group structure
 * instead of being mistaken for "already in the group model".
 */
export function migratePenGroups(
  pen: PenFile,
  options: { dropStubs?: boolean } = {}
): PenFile {
  const groups = pen.children.filter(child => child.type === 'group')
  const flatFrames = pen.children.filter(child => child.type === 'frame')
  const masters = flatFrames.filter(child => child.reusable === true)
  const screens = flatFrames.filter(child => !child.reusable)
  const other = pen.children.filter(
    child => child.type !== 'frame' && child.type !== 'group'
  )

  // Fully in the group model: every top-level frame already lives inside a
  // group, so there is nothing left to move.
  if (groups.length > 0 && flatFrames.length === 0) return pen

  // Reuse existing masters/screens groups when present so a partial
  // migration merges into them instead of duplicating or dropping content.
  let mastersGroup = groups.find(g => g.name === 'masters')
  let screensGroup = groups.find(g => g.name === 'screens')
  const otherGroups = groups.filter(
    g => g !== mastersGroup && g !== screensGroup
  )

  // Names become pure human labels: strip the retired package::Component
  // prefix. Identity now comes from the group path (masters/<pkg>) and the
  // component label must be the exported symbol name ('Button', not
  // 'design::Button').
  for (const master of masters) {
    if (master.name.includes('::')) {
      master.name = master.name.split('::').pop() as string
    }
  }

  if (masters.length > 0) {
    if (!mastersGroup) {
      mastersGroup = groupNode('masters', 'masters')
    }
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
      let pkgGroup = (mastersGroup.children ?? []).find(
        child => child.name === pkg
      )
      if (!pkgGroup) {
        pkgGroup = groupNode(pkg, `masters/${pkg}`)
        ;(mastersGroup.children ??= []).push(pkgGroup)
      }
      ;(pkgGroup.children ??= []).push(...(byPkg.get(pkg) ?? []))
    }
    ;(mastersGroup.children ??= []).push(...ungroupedMasters)
  }

  if (screens.length > 0) {
    if (!screensGroup) {
      screensGroup = groupNode('screens', 'screens')
    }
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
      let surfaceGroup = (screensGroup.children ?? []).find(
        child => child.name === surface
      )
      if (!surfaceGroup) {
        surfaceGroup = groupNode(surface, `screens/${surface}`)
        screensGroup.children!.push(surfaceGroup)
      }
      let familyGroup = (surfaceGroup.children ?? []).find(
        child => child.name === family
      )
      if (!familyGroup) {
        familyGroup = groupNode(family, `screens/${key}`)
        ;(surfaceGroup.children ??= []).push(familyGroup)
      }
      ;(familyGroup.children ??= []).push(...(byFamily.get(key) ?? []))
    }
  }

  pen.children = [
    ...(mastersGroup ? [mastersGroup] : []),
    ...(screensGroup ? [screensGroup] : []),
    ...other,
    ...otherGroups,
  ]
  return pen
}

/**
 * Resolve the pen file path from CLI args. `--pen-file <p>` wins; otherwise
 * the default repro.pen is used. A missing value or a flag used as a value is
 * an error (mirrors pen-contract's CLI strictness). Never reads args[0] when
 * the flag is absent.
 */
export function resolvePenFileArg(args: string[]): {
  penFile: string
  error?: string
} {
  const idx = args.indexOf('--pen-file')
  if (idx === -1) return { penFile: PEN_FILE }
  const value = args[idx + 1]
  if (value === undefined || value.startsWith('--')) {
    // Never return a usable penFile on error — the caller must not be able
    // to proceed with a value it did not really get from the CLI.
    return {
      penFile: '',
      error: '--pen-file requires a value (a .pen file path)',
    }
  }
  if (!existsSync(value)) {
    return {
      penFile: '',
      error: `--pen-file path does not exist: ${value}`,
    }
  }
  return { penFile: value }
}

function main(): void {
  const args = process.argv.slice(2)
  const { penFile, error } = resolvePenFileArg(args)
  if (error) {
    console.error(`ERROR: ${error}`)
    process.exit(1)
  }
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
    process.exitCode = 0
    return
  }
  if (readFileSync(penFile, 'utf8') === output) {
    console.error(`${penFile} is already in the group model — no changes.`)
    process.exitCode = 0
    return
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
