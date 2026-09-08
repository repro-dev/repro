/**
 * storybook-a11y-scan.ts
 *
 * Repo-wide a11y-suppression scanner for the Storybook a11y gate
 * (REP-1648, tracked under REP-1685): any story file that suppresses or
 * overrides a11y — a blanket `disable: true`, a named disable, or an
 * options.rules / config.rules `enabled: false` — must carry the REP-1685
 * tracking reference in its suppression reason.
 *
 * The scanner looks ONLY inside `a11y: { … }` parameter blocks so unrelated
 * docs/table disable settings (argTypes `table: { disable: true }`,
 * `docs: { disable: true }`) are never flagged.
 *
 * Pure source-text functions — no DOM, no network — so the pin stays
 * unit-testable. Consumed by scripts/a11y-critical-rules.test.ts (six known
 * suppressions) and scripts/a11y-critical-rules.scan.test.ts (repo-wide
 * sweep).
 */

import * as fs from 'fs'
import * as path from 'path'

/** Directories that never contain story sources. */
const STORY_SCAN_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tmp',
])

/**
 * Extract the balanced-brace body of every `a11y: { … }` object in the
 * source (bare, `'a11y':` or `"a11y":` key forms).
 */
export function extractA11yBlocks(source: string): string[] {
  const blocks: string[] = []
  const opener = /(?:^|[^A-Za-z0-9_$])(?:'a11y'|"a11y"|a11y)\s*:\s*\{/g

  for (const match of source.matchAll(opener)) {
    // The block body starts right after the opening `{`.
    const start = (match.index ?? 0) + match[0].length
    let depth = 1
    let cursor = start

    while (cursor < source.length && depth > 0) {
      const ch = source[cursor]
      if (ch === '{') depth += 1
      if (ch === '}') depth -= 1
      cursor += 1
    }

    // If depth never returned to 0 (a comment/string containing an
    // unmatched brace), over-capture to EOF rather than skip: a suppression
    // must never be silently missed, and a false positive fails loudly.
    const end = depth === 0 ? cursor - 1 : source.length
    blocks.push(source.slice(start, end))
  }

  return blocks
}

export type A11ySuppressionKind = 'blanket-disable' | 'rule-override'

export interface A11ySuppression {
  kind: A11ySuppressionKind
  /** Compact single-line view of the suppressing block (diagnostics only). */
  snippet: string
}

/**
 * Find a11y suppressions/overrides inside a story file's `a11y` parameter
 * blocks:
 * - a blanket `disable: true`;
 * - a per-rule override (`enabled: false`) under either the run-time
 *   `options.rules` or the configure-time `config.rules` shape;
 * - a named disable (`disable: 'rule-id'` or `disable: ['rule-id', …]`),
 *   which suppresses those named rules — treated as a rule suppression,
 *   never as a blanket one. An explicit `disable: false` re-enables and is
 *   not a suppression.
 */
export function findA11ySuppressions(source: string): A11ySuppression[] {
  const suppressions: A11ySuppression[] = []

  for (const block of extractA11yBlocks(source)) {
    if (/\bdisable\s*:\s*true\b/.test(block)) {
      suppressions.push({
        kind: 'blanket-disable',
        snippet: block.replace(/\s+/g, ' ').trim().slice(0, 160),
      })
    }

    // One entry per kind per block, even when several named-suppression
    // patterns hit the same block.
    const namedOverride =
      /\benabled\s*:\s*false\b/.test(block) ||
      /\bdisable\s*:\s*(?:'[^']*'|"[^"]*"|\[[^\]]*\])/.test(block)

    if (namedOverride) {
      suppressions.push({
        kind: 'rule-override',
        snippet: block.replace(/\s+/g, ' ').trim().slice(0, 160),
      })
    }
  }

  return suppressions
}

/** Every *.stories.ts(x) under the given roots, skipping build output. */
export function collectStoryFiles(roots: string[]): string[] {
  const files: string[] = []

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (
          entry.name.startsWith('.') ||
          STORY_SCAN_SKIP_DIRS.has(entry.name)
        ) {
          continue
        }
        walk(entryPath)
      } else if (/\.stories\.tsx?$/.test(entry.name)) {
        files.push(entryPath)
      }
    }
  }

  for (const root of roots) walk(root)
  return files.sort()
}

/**
 * The six stories suppressed during the REP-1648 first run. Each tripped
 * exactly one critical rule (verified against tmp/a11y-criticals-run4.log),
 * so the suppression must disable ONLY that named rule — keeping the rest
 * of the critical rule set active — instead of a blanket `disable: true`.
 */
export const SUPPRESSED_STORIES: Array<{
  file: string
  rule: string
  extraRefs?: string[]
}> = [
  {
    file: 'packages/agentic-ui/src/AgenticView.stories.tsx',
    rule: 'label',
  },
  {
    file: 'packages/design/src/AgenticInput/AgenticInput.stories.tsx',
    rule: 'label',
  },
  {
    file: 'packages/design/src/DropdownMenu/DropdownMenu.stories.tsx',
    rule: 'aria-allowed-attr',
  },
  {
    file: 'packages/design/src/DragHandle/DragHandle.stories.tsx',
    rule: 'aria-required-attr',
  },
  {
    file: 'packages/playback/src/PlaybackNavigation/PlaybackNavigation.stories.tsx',
    rule: 'button-name',
    // The playback a11y fix is tracked separately: REP-1680.
    extraRefs: ['REP-1680'],
  },
  {
    file: 'packages/devtools/src/DevTools.stories.tsx',
    rule: 'aria-required-attr',
  },
]
