/**
 * Tests for history.ts — rolling baseline computation and history management.
 *
 * All functions under test are pure (no I/O). The I/O layer (reading/writing
 * history.json) is tested indirectly via integration tests in
 * update-baseline.test.ts.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendRunToHistory,
  computeRollingBaseline,
  type HistoryEntry,
  type HistoryRun,
  MIN_DATA_POINTS,
  ROLLING_WINDOW_DAYS,
} from './history'
import type { BaselineEntry } from './regressions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(
  fixtureName: string,
  correctnessRate: number,
  avgErrorRate: number,
  avgToolCalls: number,
  avgQuality: number
): HistoryRun {
  return {
    fixtureName,
    correctnessRate,
    avgErrorRate,
    avgToolCalls,
    avgQuality,
  }
}

function makeEntry(date: string, runs: HistoryRun[]): HistoryEntry {
  return { date, runs }
}

/** Fixed reference date used throughout these tests. */
const REFERENCE_DATE = new Date('2026-01-08T00:00:00Z')

/** Build a date string N days before the reference date (UTC midnight). */
function daysAgo(n: number): string {
  const d = new Date(REFERENCE_DATE)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// appendRunToHistory
// ---------------------------------------------------------------------------

describe('appendRunToHistory — adds run to existing date entry', () => {
  it('appends runs to a matching existing date entry', () => {
    const today = '2026-01-08'
    const existing: HistoryEntry[] = [
      makeEntry(today, [makeRun('fixture-a', 1.0, 0.0, 5.0, 2.0)]),
    ]
    const newRuns: HistoryRun[] = [makeRun('fixture-b', 0.67, 0.05, 7.0, 1.8)]

    const result = appendRunToHistory(existing, newRuns, today)

    assert.equal(result.length, 1, 'should still have one entry for today')
    assert.equal(result[0]!.date, today)
    assert.equal(result[0]!.runs.length, 2, 'should have both old and new runs')
  })

  it('creates a new date entry when date does not exist', () => {
    const yesterday = '2026-01-07'
    const today = '2026-01-08'
    const existing: HistoryEntry[] = [
      makeEntry(yesterday, [makeRun('fixture-a', 1.0, 0.0, 5.0, 2.0)]),
    ]
    const newRuns: HistoryRun[] = [makeRun('fixture-a', 0.67, 0.1, 6.0, 2.0)]

    const result = appendRunToHistory(existing, newRuns, today)

    assert.equal(result.length, 2, 'should have two date entries')
    const todayEntry = result.find(e => e.date === today)
    assert.ok(todayEntry, 'should have an entry for today')
    assert.equal(todayEntry!.runs.length, 1)
    assert.equal(todayEntry!.runs[0]!.fixtureName, 'fixture-a')
  })

  it('starts from empty history when no existing entries', () => {
    const today = '2026-01-08'
    const runs: HistoryRun[] = [makeRun('fixture-a', 1.0, 0.0, 5.0, 2.0)]

    const result = appendRunToHistory([], runs, today)

    assert.equal(result.length, 1)
    assert.equal(result[0]!.date, today)
    assert.equal(result[0]!.runs.length, 1)
  })

  it('deduplicates runs by fixtureName when the same fixture appears twice on the same date', () => {
    const today = '2026-01-08'
    const existing: HistoryEntry[] = [
      makeEntry(today, [makeRun('fixture-a', 1.0, 0.0, 5.0, 2.0)]),
    ]
    // A second dispatch on the same day with the same fixture — should overwrite
    const newRuns: HistoryRun[] = [makeRun('fixture-a', 0.67, 0.1, 8.0, 1.5)]

    const result = appendRunToHistory(existing, newRuns, today)

    assert.equal(result.length, 1, 'one date entry')
    assert.equal(
      result[0]!.runs.length,
      1,
      'duplicate fixture should be replaced, not appended'
    )
    // The newer value should win
    assert.equal(result[0]!.runs[0]!.correctnessRate, 0.67)
  })
})

// ---------------------------------------------------------------------------
// computeRollingBaseline — rolling average computation
// ---------------------------------------------------------------------------

describe('computeRollingBaseline — uses last N days window', () => {
  it('computes average across entries within the rolling window', () => {
    // 3 entries within a 7-day window
    const history: HistoryEntry[] = [
      makeEntry(daysAgo(0), [makeRun('fixture-a', 1.0, 0.1, 8.0, 2.0)]),
      makeEntry(daysAgo(2), [makeRun('fixture-a', 0.67, 0.0, 9.0, 2.0)]),
      makeEntry(daysAgo(5), [makeRun('fixture-a', 1.0, 0.2, 7.0, 2.0)]),
    ]
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'fixture-a',
        correctnessRate: 1.0,
        avgErrorRate: 0.1,
        avgToolCalls: 8.0,
        avgQuality: 2.0,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    const entry = result.find(b => b.fixtureName === 'fixture-a')
    assert.ok(entry, 'should have an entry for fixture-a')

    // correctnessRate: (1.0 + 0.67 + 1.0) / 3 ≈ 0.89
    assert.ok(
      Math.abs(entry!.correctnessRate - (1.0 + 0.67 + 1.0) / 3) < 0.01,
      `expected ~${(1.0 + 0.67 + 1.0) / 3}, got ${entry!.correctnessRate}`
    )
  })

  it('excludes entries older than ROLLING_WINDOW_DAYS', () => {
    // One entry just inside the window, one just outside
    const history: HistoryEntry[] = [
      makeEntry(daysAgo(ROLLING_WINDOW_DAYS - 1), [
        makeRun('fixture-a', 1.0, 0.0, 5.0, 2.0),
      ]),
      makeEntry(daysAgo(ROLLING_WINDOW_DAYS + 1), [
        // This should be excluded (outside window)
        makeRun('fixture-a', 0.0, 1.0, 20.0, 1.0),
      ]),
    ]
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'fixture-a',
        correctnessRate: 1.0,
        avgErrorRate: 0.0,
        avgToolCalls: 5.0,
        avgQuality: 2.0,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    const entry = result.find(b => b.fixtureName === 'fixture-a')
    assert.ok(entry)
    // Only the in-window entry counts: correctnessRate should be 1.0, not 0.5
    assert.equal(entry!.correctnessRate, 1.0)
  })

  it('falls back to committed baseline when fewer than MIN_DATA_POINTS exist', () => {
    // Only 2 entries — below the minimum of 3
    const history: HistoryEntry[] = [
      makeEntry(daysAgo(0), [makeRun('fixture-a', 0.0, 0.5, 20.0, 1.0)]),
      makeEntry(daysAgo(1), [makeRun('fixture-a', 0.0, 0.5, 20.0, 1.0)]),
    ]
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'fixture-a',
        correctnessRate: 1.0,
        avgErrorRate: 0.05,
        avgToolCalls: 7.0,
        avgQuality: 2.0,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    const entry = result.find(b => b.fixtureName === 'fixture-a')
    assert.ok(entry, 'should still have an entry')
    // Should use committed values, not the (noisy) 2-point history
    assert.equal(entry!.correctnessRate, 1.0)
    assert.equal(entry!.avgErrorRate, 0.05)
    assert.equal(entry!.avgToolCalls, 7.0)
  })

  it('uses exactly MIN_DATA_POINTS when available (boundary)', () => {
    // Exactly MIN_DATA_POINTS (3) entries — should compute average, not fall back
    const history: HistoryEntry[] = Array.from(
      { length: MIN_DATA_POINTS },
      (_, i) =>
        makeEntry(daysAgo(i), [makeRun('fixture-a', 0.5, 0.1, 6.0, 2.0)])
    )
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'fixture-a',
        correctnessRate: 1.0,
        avgErrorRate: 0.0,
        avgToolCalls: 5.0,
        avgQuality: 2.0,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    const entry = result.find(b => b.fixtureName === 'fixture-a')
    assert.ok(entry)
    // All 3 have correctnessRate 0.5 so average is 0.5 (not the committed 1.0)
    assert.equal(entry!.correctnessRate, 0.5)
  })

  it('preserves committed baseline for fixtures with no history', () => {
    // History has no entries for 'fixture-b'
    const history: HistoryEntry[] = [
      makeEntry(daysAgo(0), [makeRun('fixture-a', 1.0, 0.0, 5.0, 2.0)]),
    ]
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'fixture-a',
        correctnessRate: 1.0,
        avgErrorRate: 0.0,
        avgToolCalls: 5.0,
        avgQuality: 2.0,
      },
      {
        fixtureName: 'fixture-b',
        correctnessRate: 0.67,
        avgErrorRate: 0.1,
        avgToolCalls: 9.0,
        avgQuality: 1.8,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    const entryB = result.find(b => b.fixtureName === 'fixture-b')
    assert.ok(entryB, 'fixture-b should still appear in output')
    assert.equal(entryB!.correctnessRate, 0.67, 'should use committed value')
  })

  it('rounds output values to 3 decimal places', () => {
    // Use values that produce repeating decimals
    const history: HistoryEntry[] = [
      makeEntry(daysAgo(0), [makeRun('fixture-a', 1.0, 0.0, 8.0, 2.0)]),
      makeEntry(daysAgo(1), [makeRun('fixture-a', 1.0, 0.0, 8.0, 2.0)]),
      makeEntry(daysAgo(2), [makeRun('fixture-a', 0.0, 0.0, 8.0, 2.0)]),
    ]
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'fixture-a',
        correctnessRate: 1.0,
        avgErrorRate: 0.0,
        avgToolCalls: 8.0,
        avgQuality: 2.0,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    const entry = result.find(b => b.fixtureName === 'fixture-a')
    assert.ok(entry)
    // (1.0 + 1.0 + 0.0) / 3 = 0.666... → rounds to 0.667
    assert.equal(entry!.correctnessRate, 0.667)
  })

  it('returns entries for all fixtures in committed baseline', () => {
    const history: HistoryEntry[] = []
    const committed: BaselineEntry[] = [
      {
        fixtureName: 'f1',
        correctnessRate: 1.0,
        avgErrorRate: 0.0,
        avgToolCalls: 5.0,
        avgQuality: 2.0,
      },
      {
        fixtureName: 'f2',
        correctnessRate: 0.67,
        avgErrorRate: 0.1,
        avgToolCalls: 9.0,
        avgQuality: 1.8,
      },
    ]

    const result = computeRollingBaseline(history, committed, REFERENCE_DATE)

    assert.equal(result.length, 2)
    const names = result.map(e => e.fixtureName)
    assert.ok(names.includes('f1'))
    assert.ok(names.includes('f2'))
  })
})

// ---------------------------------------------------------------------------
// Constants are exported with expected values
// ---------------------------------------------------------------------------

describe('history constants', () => {
  it('ROLLING_WINDOW_DAYS is 7', () => {
    assert.equal(ROLLING_WINDOW_DAYS, 7)
  })

  it('MIN_DATA_POINTS is 3', () => {
    assert.equal(MIN_DATA_POINTS, 3)
  })
})
