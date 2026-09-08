/**
 * Unit tests for the Storybook a11y gate's critical rule list
 * (apps/storybook-ui/.storybook/a11y-critical-rules.js).
 *
 * The a11y gate enables only critical-impact axe rules (with
 * disableOtherRules: true). This test pins the list to the installed
 * axe-core so a dependency bump that adds/moves critical rules fails here
 * instead of silently widening or narrowing the CI gate.
 *
 * Rule impacts are extracted from the installed axe-core source: rules are
 * declared as adjacent `id: '...', impact: '...'` fields, which makes a
 * DOM-free static extraction reliable for this pin.
 *
 * Also pins the per-story a11y suppressions introduced in REP-1648: each
 * must disable a NAMED critical rule (never a blanket `disable: true`) so
 * the rest of the critical rule set stays active for that story, and must
 * carry the REP-1685 tracking id (PlaybackNavigation also REP-1680).
 *
 * Run:
 *   node --test scripts/a11y-critical-rules.test.ts
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

// ---------------------------------------------------------------------------
// Locate the installed axe-core (transitive dep of @storybook/addon-a11y)
// ---------------------------------------------------------------------------

/**
 * Compare two version strings from pnpm store dir names (e.g. '4.11.1',
 * '4.10.2', '4.12.0-alpha.1'). Numeric comparison on the major/minor/patch
 * triple; when numerics are equal, a plain prerelease sorts below a
 * release. Lexicographic ordering is NOT safe here ('4.10.2' < '4.11.1'
 * lexically but not numerically).
 */
export function compareAxeVersions(a: string, b: string): number {
  const toParts = (version: string): [number, number, number, string] => {
    const [numeric, prerelease = ''] = version.split('-', 2)
    const [major, minor = '0', patch = '0'] = numeric!.split('.', 3)

    return [
      Number.parseInt(major ?? '0', 10) || 0,
      Number.parseInt(minor ?? '0', 10) || 0,
      Number.parseInt(patch ?? '0', 10) || 0,
      prerelease,
    ]
  }

  const [aMajor, aMinor, aPatch, aPre] = toParts(a)
  const [bMajor, bMinor, bPatch, bPre] = toParts(b)

  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  if (aPatch !== bPatch) return aPatch - bPatch

  // Equal numerics: a release ('') outranks any prerelease.
  if (aPre === bPre) return 0
  if (aPre === '') return 1
  if (bPre === '') return -1

  return aPre < bPre ? -1 : aPre > bPre ? 1 : 0
}

/**
 * Pick the axe-core store dir to extract from. pnpm can keep multiple
 * axe-core@ entries when different packages pin different versions;
 * sorting lexicographically picks the WRONG one, so select the highest
 * version instead.
 */
export function pickAxeStoreDir(entries: string[]): string {
  if (entries.length === 0) {
    throw new Error('axe-core not found under node_modules/.pnpm')
  }

  return entries.reduce((best, dir) => {
    const version = (dir: string) => dir.slice('axe-core@'.length)

    return compareAxeVersions(version(dir), version(best)) > 0 ? dir : best
  })
}

function findAxeSource(): { version: string; source: string } {
  const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm')
  const entries = fs
    .readdirSync(pnpmDir)
    .filter(dir => dir.startsWith('axe-core@'))

  const dir = pickAxeStoreDir(entries)
  const version = dir.slice('axe-core@'.length)
  const source = fs.readFileSync(
    path.join(pnpmDir, dir, 'node_modules', 'axe-core', 'axe.js'),
    'utf8'
  )

  return { version, source }
}

interface AxeRule {
  id: string
  impact: string
}

/** axe.js declares rules with adjacent id/impact fields — extract them statically. */
function extractAxeRules(source: string): AxeRule[] {
  const rulePattern =
    /id:\s*'([\w-]+)',\s*\n\s*impact:\s*'(critical|serious|moderate|minor)'/g
  const rules: AxeRule[] = []
  for (const match of source.matchAll(rulePattern)) {
    rules.push({ id: match[1]!, impact: match[2]! })
  }
  return rules
}

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

const moduleSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps',
    'storybook-ui',
    '.storybook',
    'a11y-critical-rules.js'
  ),
  'utf8'
)

function readRuleIds(moduleText: string): string[] {
  const block = moduleText.match(
    /export const criticalA11yRules = \[([^\]]*)\]/
  )
  assert.ok(block, 'module must export criticalA11yRules as an array literal')
  return Array.from(block[1]!.matchAll(/'([\w-]+)'/g)).map(m => m[1]!)
}

describe('critical a11y rule pin (REP-1648)', () => {
  it('lists every critical-impact rule of the installed axe-core and nothing else', () => {
    const { source } = findAxeSource()
    const rules = extractAxeRules(source)
    const critical = rules.filter(r => r.impact === 'critical').map(r => r.id)
    const pinned = readRuleIds(moduleSource)

    assert.ok(
      rules.length > 100,
      `rule extraction must find a sane number of rules in the installed axe-core (got ${rules.length}) — a count this low means the extraction pattern no longer matches axe.js`
    )
    assert.ok(
      critical.length > 0,
      'the installed axe-core must declare critical-impact rules'
    )

    const missing = critical.filter(id => !pinned.includes(id))
    const extra = pinned.filter(id => !critical.includes(id))

    assert.deepEqual(
      missing,
      [],
      `critical rules missing from the pin (regenerate a11y-critical-rules.js): ${missing.join(
        ', '
      )}`
    )
    assert.deepEqual(
      extra,
      [],
      `pinned rules that are not critical-impact in the installed axe-core: ${extra.join(
        ', '
      )}`
    )
  })

  it('has no duplicate entries', () => {
    const pinned = readRuleIds(moduleSource)
    assert.equal(new Set(pinned).size, pinned.length)
  })

  it('is sorted for stable diffs', () => {
    const pinned = readRuleIds(moduleSource)
    assert.deepEqual(pinned, [...pinned].sort())
  })
})

describe('axe-core store entry selection', () => {
  it('picks the highest version, not the lexicographically first', () => {
    assert.equal(
      pickAxeStoreDir(['axe-core@4.10.2', 'axe-core@4.11.1']),
      'axe-core@4.11.1'
    )
    assert.equal(
      pickAxeStoreDir(['axe-core@4.11.1', 'axe-core@4.9.0']),
      'axe-core@4.11.1'
    )
    assert.equal(
      pickAxeStoreDir([
        'axe-core@4.11.1',
        'axe-core@4.10.9',
        'axe-core@4.11.0',
      ]),
      'axe-core@4.11.1'
    )
  })

  it('treats a release as higher than a prerelease of the same numerics', () => {
    assert.equal(
      pickAxeStoreDir(['axe-core@4.12.0-alpha.1', 'axe-core@4.11.1']),
      'axe-core@4.12.0-alpha.1'
    )
    assert.equal(
      pickAxeStoreDir(['axe-core@4.12.0', 'axe-core@4.12.0-alpha.1']),
      'axe-core@4.12.0'
    )
  })

  it('handles a single entry and rejects an empty list', () => {
    assert.equal(pickAxeStoreDir(['axe-core@4.11.1']), 'axe-core@4.11.1')
    assert.throws(() => pickAxeStoreDir([]), /axe-core not found/)
  })
})

// ---------------------------------------------------------------------------
// Per-story a11y suppressions (REP-1648 → tracked under REP-1685)
// ---------------------------------------------------------------------------

/**
 * The six stories suppressed during the REP-1648 first run. Each tripped
 * exactly one critical rule (verified against tmp/a11y-criticals-run4.log),
 * so the suppression must disable ONLY that named rule — keeping the rest
 * of the critical rule set active — instead of a blanket `disable: true`.
 */
const SUPPRESSED_STORIES: Array<{
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

describe('suppressed story parameters (tracked under REP-1685)', () => {
  const criticalRules = new Set(readRuleIds(moduleSource))

  for (const { file, rule, extraRefs = [] } of SUPPRESSED_STORIES) {
    describe(file, () => {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')

      it('does not use a blanket a11y disable', () => {
        assert.ok(
          !/disable:\s*true/.test(source),
          'a11y suppression must be a named-rule disable, not a blanket `disable: true` (REP-1685)'
        )
      })

      it(`disables only the known rule '${rule}' by name`, () => {
        assert.ok(
          criticalRules.has(rule),
          `${rule} must be a critical axe rule (pin: a11y-critical-rules.js)`
        )

        // Per-story run-time override: parameters.a11y.options.rules with a
        // rule-id key disabled. (Story-level `config.rules` is an array and
        // would REPLACE the preview-level critical-only enable-list —
        // narrowing must go through `options.rules`.)
        const namedDisable = new RegExp(
          `['"]?${rule}['"]?\\s*:\\s*\\{\\s*enabled\\s*:\\s*false`
        )
        assert.ok(
          namedDisable.test(source),
          `expected a named run-time disable for '${rule}' under parameters.a11y.options.rules`
        )
      })

      it(
        'reason references REP-1685' +
          (extraRefs.length ? ` and ${extraRefs.join(', ')}` : ''),
        () => {
          assert.ok(
            source.includes('REP-1685'),
            'suppression reason must carry the REP-1685 tracking id'
          )
          for (const ref of extraRefs) {
            assert.ok(
              source.includes(ref),
              `suppression reason must also carry ${ref}`
            )
          }
        }
      )
    })
  }
})
