#!/usr/bin/env node
// REP-1650: clipping/overlap gate for pen screens (pen-design-workflow §9).
//
// Two pure scans over a PenFile, both scoped to screen subtrees (non-reusable
// collection-level frames — the same traversal extractScreens uses):
//
//   findClippingViolations — explicit-geometry nodes whose absolute rect
//     extends beyond their enclosing screen frame's bounds (0.5px tolerance).
//   findOverlapViolations  — sibling pairs that BOTH carry full explicit
//     rects and intersect by more than 1px on both axes. Parent-child
//     containment is not overlap (pairs are siblings only).
//
// Geometry model (matches pen's layout reality — see tmp/bugfix-REP-1650.md):
// frames carry x/y/width/height plus auto-layout props (alignItems/gap/
// padding); auto-layout children carry NO x/y — they are laid out by their
// parent, so they never contribute a rect. Only explicit finite numeric
// geometry participates; explicit x/y accumulate along the path inside the
// screen frame so nested frames are checked at absolute coordinates.
// Subtrees with `enabled: false` anywhere on the path are skipped.
//
// CLI:
//   tsx scripts/pen-clipping-scan.ts [--pen-file <p>] [--help]
// Exits 1 when any violation is found, 0 when the file is clean.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  extractScreens,
  findNodeByIdRecursive,
  parsePenJson,
  REPO_ROOT,
  type PenFile,
  type PenNode,
} from './pen-lint.ts'

export const DEFAULT_PEN_FILE = resolve(REPO_ROOT, 'repro.pen')

/** Tolerance in px: rects within half a pixel of a bounds edge are flush, not clipped. */
const CLIPPING_TOLERANCE_PX = 0.5
/** Sibling overlap must exceed 1px on BOTH axes to count (no sliver false positives). */
const OVERLAP_MIN_AXIS_PX = 1

export interface ClippingViolation {
  kind: 'clipping' | 'overlap'
  screenName: string
  nodeId: string
  nodeName: string
  detail: string
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * The node's explicit rect, or null. All four fields must be explicit finite
 * numbers — a node without explicit x/y is auto-layout positioned (its parent
 * lays it out), and a node without explicit width/height has no known extent.
 */
function explicitRect(node: PenNode): Rect | null {
  const { x, y, width, height } = node as Record<string, unknown>
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  return { x, y, width, height }
}

interface ScreenWalk {
  /** Absolute rects per contributing node (screen frame itself excluded). */
  rects: Map<PenNode, Rect>
  /** Children lists that contain at least two explicit-rect siblings. */
  siblingGroups: Array<{
    parent: PenNode
    originX: number
    originY: number
    children: Array<{ node: PenNode; rect: Rect }>
  }>
}

/**
 * Walk one screen's subtree accumulating explicit x/y along the path.
 * Coordinates are relative to the screen frame's origin (the screen's own
 * canvas x/y is not added — every check is screen-local, so canvas placement
 * never leaks into the comparison).
 */
function walkScreenSubtree(screenFrame: PenNode): ScreenWalk {
  const rects = new Map<PenNode, Rect>()
  const siblingGroups: ScreenWalk['siblingGroups'] = []

  const visit = (
    node: PenNode,
    originX: number,
    originY: number,
    disabled: boolean
  ): void => {
    if (disabled || node.enabled === false) return
    const rect = explicitRect(node)
    if (rect) {
      const absolute: Rect = {
        x: originX + rect.x,
        y: originY + rect.y,
        width: rect.width,
        height: rect.height,
      }
      rects.set(node, absolute)
    }
    if (!Array.isArray(node.children)) return
    // Sibling pairs only include children that will actually contribute a
    // rect — disabled children are skipped entirely, so they must not pair.
    const explicitChildren = node.children.filter(
      child => explicitRect(child) !== null && child.enabled !== false
    )
    if (explicitChildren.length >= 2) {
      siblingGroups.push({
        parent: node,
        originX,
        originY,
        children: explicitChildren.map(child => ({
          node: child,
          rect: explicitRect(child) as Rect,
        })),
      })
    }
    // Nodes without explicit x/y contribute nothing to the accumulation —
    // their auto-layout position is unknown, and their explicit-geometry
    // descendants are checked from the last known origin.
    const nextOriginX = rect ? originX + rect.x : originX
    const nextOriginY = rect ? originY + rect.y : originY
    for (const child of node.children) {
      // The child's own enabled:false is checked at its visit; only the
      // inherited disabled state must be forwarded here.
      visit(child, nextOriginX, nextOriginY, disabled)
    }
  }

  visit(screenFrame, 0, 0, false)
  return { rects, siblingGroups }
}

function screenFrames(pen: PenFile): Array<{ name: string; frame: PenNode }> {
  const result: Array<{ name: string; frame: PenNode }> = []
  for (const screen of extractScreens(pen)) {
    const frame = findNodeByIdRecursive(pen, screen.id)
    if (frame) result.push({ name: screen.name, frame })
  }
  return result
}

/** Screen-local bounds of a screen frame, or null when it has no numeric extent. */
function screenBounds(frame: PenNode): Rect | null {
  const rect = explicitRect(frame)
  return rect
}

function describeClipping(rect: Rect, bounds: Rect): string {
  const overflows: string[] = []
  if (rect.x < bounds.x - CLIPPING_TOLERANCE_PX) {
    overflows.push(`left edge ${rect.x}px is beyond the frame's left edge`)
  }
  if (rect.y < bounds.y - CLIPPING_TOLERANCE_PX) {
    overflows.push(`top edge ${rect.y}px is beyond the frame's top edge`)
  }
  if (rect.x + rect.width > bounds.x + bounds.width + CLIPPING_TOLERANCE_PX) {
    overflows.push(
      `right edge ${rect.x + rect.width}px exceeds the frame's right edge ${
        bounds.x + bounds.width
      }px`
    )
  }
  if (rect.y + rect.height > bounds.y + bounds.height + CLIPPING_TOLERANCE_PX) {
    overflows.push(
      `bottom edge ${rect.y + rect.height}px exceeds the frame's bottom edge ${
        bounds.y + bounds.height
      }px`
    )
  }
  return overflows.join('; ')
}

export function findClippingViolations(pen: PenFile): ClippingViolation[] {
  const violations: ClippingViolation[] = []
  for (const { name, frame } of screenFrames(pen)) {
    const bounds = screenBounds(frame)
    if (!bounds) continue
    const { rects } = walkScreenSubtree(frame)
    for (const [node, rect] of rects) {
      const detail = describeClipping(rect, bounds)
      if (detail) {
        violations.push({
          kind: 'clipping',
          screenName: name,
          nodeId: node.id,
          nodeName: node.name,
          detail: `${detail} — node ${rect.width}x${rect.height} at (${rect.x}, ${rect.y}) in "${name}" (${bounds.width}x${bounds.height})`,
        })
      }
    }
  }
  return violations
}

export function findOverlapViolations(pen: PenFile): ClippingViolation[] {
  const violations: ClippingViolation[] = []
  for (const { name, frame } of screenFrames(pen)) {
    const { siblingGroups } = walkScreenSubtree(frame)
    for (const group of siblingGroups) {
      for (let i = 0; i < group.children.length; i++) {
        for (let j = i + 1; j < group.children.length; j++) {
          const a = group.children[i]
          const b = group.children[j]
          if (!a || !b) continue
          const aAbs: Rect = {
            x: group.originX + a.rect.x,
            y: group.originY + a.rect.y,
            width: a.rect.width,
            height: a.rect.height,
          }
          const bAbs: Rect = {
            x: group.originX + b.rect.x,
            y: group.originY + b.rect.y,
            width: b.rect.width,
            height: b.rect.height,
          }
          const overlapWidth =
            Math.min(aAbs.x + aAbs.width, bAbs.x + bAbs.width) -
            Math.max(aAbs.x, bAbs.x)
          const overlapHeight =
            Math.min(aAbs.y + aAbs.height, bAbs.y + bAbs.height) -
            Math.max(aAbs.y, bAbs.y)
          if (
            overlapWidth > OVERLAP_MIN_AXIS_PX &&
            overlapHeight > OVERLAP_MIN_AXIS_PX
          ) {
            violations.push({
              kind: 'overlap',
              screenName: name,
              nodeId: a.node.id,
              nodeName: a.node.name,
              detail: `overlaps sibling "${b.node.name}" (${b.node.id}) by ${overlapWidth}x${overlapHeight}px in "${name}"`,
            })
          }
        }
      }
    }
  }
  return violations
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.error(`pen-clipping-scan — pen screen clipping/overlap gate (REP-1650)

Walks every screen frame's subtree with absolute coordinates and reports:
  - clipping: explicit-geometry nodes extending beyond their screen frame
    (0.5px tolerance)
  - overlap: sibling pairs with full explicit rects intersecting by more
    than 1px on both axes

Auto-layout children without explicit x/y are laid out by their parent and
are never flagged. Subtrees with enabled:false are skipped.

Usage:
  tsx scripts/pen-clipping-scan.ts                 Scan repro.pen.
  tsx scripts/pen-clipping-scan.ts --pen-file <p>  Use <p> instead of repro.pen.
  tsx scripts/pen-clipping-scan.ts --help          Show this help.

Exit codes:
  0  no violations
  1  violations found, or the pen file could not be read/parsed`)
}

export interface CliParseResult {
  penFile: string
  error?: string
}

export function parseCliArgs(args: string[]): CliParseResult {
  let penFile = DEFAULT_PEN_FILE
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--pen-file') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        return { penFile, error: '--pen-file requires a path value' }
      }
      penFile = resolve(value)
      i++
      continue
    }
    if (arg === '--help' || arg === '-h') continue
    return { penFile, error: `unknown argument "${String(arg)}"` }
  }
  return { penFile }
}

function runScan(penFile: string): number {
  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    console.error(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }

  const violations = [
    ...findClippingViolations(pen),
    ...findOverlapViolations(pen),
  ]

  if (violations.length === 0) {
    console.log('No clipping or overlap violations.')
    return 0
  }

  const byScreen = new Map<string, ClippingViolation[]>()
  for (const violation of violations) {
    const list = byScreen.get(violation.screenName) ?? []
    list.push(violation)
    byScreen.set(violation.screenName, list)
  }
  for (const [screenName, screenViolations] of byScreen) {
    console.log(`screen "${screenName}":`)
    for (const violation of screenViolations) {
      console.log(
        `  [${violation.kind}] ${violation.nodeName} (${violation.nodeId}): ${violation.detail}`
      )
    }
  }
  console.log(
    `${violations.length} violation(s) in ${byScreen.size} screen(s) — fix the geometry in repro.pen.`
  )
  return 1
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    // process.exitCode (not process.exit) so Node drains async stdout writes.
    process.exitCode = 0
  } else {
    const { penFile, error } = parseCliArgs(args)
    if (error) {
      console.error(`ERROR: ${error}`)
      printUsage()
      process.exitCode = 1
    } else {
      process.exitCode = runScan(penFile)
    }
  }
}
