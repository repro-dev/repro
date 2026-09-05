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

function findAxeSource(): { version: string; source: string } {
  const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm')
  const entries = fs
    .readdirSync(pnpmDir)
    .filter(dir => dir.startsWith('axe-core@'))
    .sort()

  if (entries.length === 0) {
    throw new Error('axe-core not found under node_modules/.pnpm')
  }

  const [dir] = entries // pnpm dedupes to a single store entry
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
      rules.length > 0,
      'rule extraction must find rules in the installed axe-core'
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
