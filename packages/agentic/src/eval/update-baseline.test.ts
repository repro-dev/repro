/**
 * Tests for update-baseline.ts — the script that reads history.json,
 * computes rolling averages, writes baseline.json, and formats the
 * old-vs-new comparison table for the PR body.
 *
 * We test the pure formatting/comparison functions without touching the
 * filesystem. I/O logic (reading/writing JSON files) is intentionally thin
 * and left untested here.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BaselineEntry } from './regressions'
import {
  diffBaselines,
  formatBaselineComparison,
  formatBaselineComparisonMarkdown,
  TEST_FIXTURE_NAMES,
  type BaselineDiff,
} from './update-baseline'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  fixtureName: string,
  correctnessRate: number,
  avgErrorRate: number,
  avgToolCalls: number,
  avgQuality: number
): BaselineEntry {
  return {
    fixtureName,
    correctnessRate,
    avgErrorRate,
    avgToolCalls,
    avgQuality,
  }
}

// ---------------------------------------------------------------------------
// diffBaselines — detects changes between old and new baseline
// ---------------------------------------------------------------------------

describe('diffBaselines — detects changes', () => {
  it('returns empty array when baselines are identical', () => {
    const old = [makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0)]
    const updated = [makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0)]

    const diffs = diffBaselines(old, updated)

    assert.equal(diffs.length, 0)
  })

  it('returns a diff entry when correctnessRate changes', () => {
    const old = [makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0)]
    const updated = [makeEntry('fixture-a', 0.857, 0.1, 8.0, 2.0)]

    const diffs = diffBaselines(old, updated)

    assert.equal(diffs.length, 1)
    assert.equal(diffs[0]!.fixtureName, 'fixture-a')
    assert.equal(diffs[0]!.old!.correctnessRate, 1.0)
    assert.equal(diffs[0]!.updated.correctnessRate, 0.857)
  })

  it('returns a diff entry when any metric changes', () => {
    const old = [makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0)]
    const updated = [makeEntry('fixture-a', 1.0, 0.15, 9.0, 1.9)]

    const diffs = diffBaselines(old, updated)

    assert.equal(diffs.length, 1)
    assert.equal(diffs[0]!.old!.avgErrorRate, 0.1)
    assert.equal(diffs[0]!.updated.avgErrorRate, 0.15)
  })

  it('handles multiple fixtures with mixed changes', () => {
    const old = [
      makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0),
      makeEntry('fixture-b', 0.67, 0.0, 7.0, 1.8),
    ]
    const updated = [
      makeEntry('fixture-a', 0.9, 0.1, 8.0, 2.0), // changed
      makeEntry('fixture-b', 0.67, 0.0, 7.0, 1.8), // unchanged
    ]

    const diffs = diffBaselines(old, updated)

    assert.equal(diffs.length, 1)
    assert.equal(diffs[0]!.fixtureName, 'fixture-a')
  })

  it('includes new fixtures (in updated but not in old) as diffs', () => {
    const old: BaselineEntry[] = []
    const updated = [makeEntry('new-fixture', 1.0, 0.0, 5.0, 2.0)]

    const diffs = diffBaselines(old, updated)

    assert.equal(diffs.length, 1)
    assert.equal(diffs[0]!.fixtureName, 'new-fixture')
    assert.equal(diffs[0]!.old, null)
  })
})

// ---------------------------------------------------------------------------
// formatBaselineComparison — plain text table for console output
// ---------------------------------------------------------------------------

describe('formatBaselineComparison — plain text table', () => {
  it('returns a no-change message when diffs is empty', () => {
    const text = formatBaselineComparison([])

    assert.ok(
      text.includes('No changes'),
      `expected "No changes" in output, got: ${text}`
    )
  })

  it('includes fixture name and changed metric values', () => {
    const diffs: BaselineDiff[] = [
      {
        fixtureName: 'fixture-a',
        old: makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0),
        updated: makeEntry('fixture-a', 0.857, 0.1, 8.0, 2.0),
      },
    ]

    const text = formatBaselineComparison(diffs)

    assert.ok(text.includes('fixture-a'), 'should mention fixture name')
    assert.ok(
      text.includes('1.0') || text.includes('100.0%'),
      'should show old correctnessRate'
    )
    assert.ok(
      text.includes('0.857') || text.includes('85.7%'),
      'should show new correctnessRate'
    )
  })
})

// ---------------------------------------------------------------------------
// formatBaselineComparisonMarkdown — markdown table for PR body
// ---------------------------------------------------------------------------

describe('formatBaselineComparisonMarkdown — markdown table', () => {
  it('returns a no-change message when diffs is empty', () => {
    const md = formatBaselineComparisonMarkdown([])

    assert.ok(
      md.includes('No changes'),
      `expected "No changes" in output, got: ${md}`
    )
  })

  it('produces markdown table syntax', () => {
    const diffs: BaselineDiff[] = [
      {
        fixtureName: 'fixture-a',
        old: makeEntry('fixture-a', 1.0, 0.1, 8.0, 2.0),
        updated: makeEntry('fixture-a', 0.857, 0.15, 9.0, 2.0),
      },
    ]

    const md = formatBaselineComparisonMarkdown(diffs)

    // Should have markdown table pipe syntax
    assert.ok(md.includes('|'), 'should contain pipe characters for table')
    assert.ok(md.includes('fixture-a'), 'should include fixture name')
    // Should have a header row with "---"
    assert.ok(md.includes('---'), 'should have table header separator')
  })

  it('includes all four metrics in the table', () => {
    const diffs: BaselineDiff[] = [
      {
        fixtureName: 'f1',
        old: makeEntry('f1', 1.0, 0.1, 8.0, 2.0),
        updated: makeEntry('f1', 0.9, 0.12, 8.5, 1.9),
      },
    ]

    const md = formatBaselineComparisonMarkdown(diffs)

    // All four metric columns must appear somewhere
    assert.ok(
      md.toLowerCase().includes('correctness'),
      'should mention correctness'
    )
    assert.ok(md.toLowerCase().includes('error'), 'should mention error rate')
    assert.ok(md.toLowerCase().includes('tool'), 'should mention tool calls')
    assert.ok(md.toLowerCase().includes('quality'), 'should mention quality')
  })

  it('handles new fixtures (old = null) gracefully', () => {
    const diffs: BaselineDiff[] = [
      {
        fixtureName: 'new-fixture',
        old: null,
        updated: makeEntry('new-fixture', 1.0, 0.0, 5.0, 2.0),
      },
    ]

    const md = formatBaselineComparisonMarkdown(diffs)

    assert.ok(md.includes('new-fixture'), 'should include new fixture name')
    // Should not throw — old = null is a valid state
  })
})

// ---------------------------------------------------------------------------
// TEST_FIXTURE_NAMES — exported constant for held-out test fixtures
// ---------------------------------------------------------------------------

describe('TEST_FIXTURE_NAMES — held-out test fixture set', () => {
  it('is exported as a Set', () => {
    assert.ok(
      TEST_FIXTURE_NAMES instanceof Set,
      'TEST_FIXTURE_NAMES should be a Set'
    )
  })

  it('contains all 6 test fixtures', () => {
    const expected = [
      'websocket-message-missing',
      'form-validation-silent-failure',
      'multi-step-error-chain',
      'slow-session-no-errors',
      'dropdown-state-not-reset',
      'error-with-dom-side-effect',
    ]
    for (const name of expected) {
      assert.ok(
        TEST_FIXTURE_NAMES.has(name),
        `TEST_FIXTURE_NAMES should contain "${name}"`
      )
    }
  })

  it('does not contain training fixtures', () => {
    assert.ok(
      !TEST_FIXTURE_NAMES.has('console-error-and-network-failure'),
      'training fixture should not be in TEST_FIXTURE_NAMES'
    )
    assert.ok(
      !TEST_FIXTURE_NAMES.has('conditional-rendering-bug'),
      'training fixture should not be in TEST_FIXTURE_NAMES'
    )
  })
})
