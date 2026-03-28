/**
 * History store and rolling baseline computation for the agentic eval harness.
 *
 * The history file (history.json) is a time-series of nightly eval results.
 * Each entry holds one date and the per-fixture metrics recorded on that date.
 * The rolling baseline is computed by averaging the last ROLLING_WINDOW_DAYS
 * of entries for each fixture — giving CI a self-correcting anchor that reflects
 * recent model behaviour rather than a single manually-curated snapshot.
 *
 * This module is pure (no I/O). File reads/writes live in update-baseline.ts.
 */

import type { BaselineEntry } from "./regressions";

/** Number of calendar days included in the rolling average window. */
export const ROLLING_WINDOW_DAYS = 7;

/**
 * Minimum number of data points required before we compute a rolling average.
 * If fewer data points exist for a fixture, the committed baseline value is
 * preserved — this prevents bootstrapping noise from an empty history file.
 */
export const MIN_DATA_POINTS = 3;

/** Per-fixture metrics for a single nightly run. */
export interface HistoryRun {
  fixtureName: string;
  correctnessRate: number;
  avgErrorRate: number;
  avgToolCalls: number;
  avgQuality: number;
}

/** A single day's entry in the history file. */
export interface HistoryEntry {
  /** ISO date string: YYYY-MM-DD */
  date: string;
  runs: HistoryRun[];
}

/**
 * Appends a nightly run's results to the existing history.
 *
 * Idempotency rule: if an entry already exists for `date`, new runs are merged
 * into it. If a run with the same `fixtureName` already exists on that date,
 * the newer value replaces the older one — this makes the operation safe to
 * re-run if a nightly job fires twice on the same day (e.g. scheduled + manual
 * dispatch).
 */
export function appendRunToHistory(
  existing: HistoryEntry[],
  newRuns: HistoryRun[],
  date: string,
): HistoryEntry[] {
  const result = existing.map((e) => ({ ...e, runs: [...e.runs] }));

  let dateEntry = result.find((e) => e.date === date);
  if (dateEntry === undefined) {
    dateEntry = { date, runs: [] };
    result.push(dateEntry);
  }

  for (const run of newRuns) {
    const existingIdx = dateEntry.runs.findIndex(
      (r) => r.fixtureName === run.fixtureName,
    );
    if (existingIdx >= 0) {
      // Replace with newer value
      dateEntry.runs[existingIdx] = run;
    } else {
      dateEntry.runs.push(run);
    }
  }

  return result;
}

/**
 * Computes rolling averages for each fixture from the history and returns a
 * new baseline array.
 *
 * For each fixture in the committed baseline:
 *   - Collect all history entries within the last ROLLING_WINDOW_DAYS calendar
 *     days (inclusive of today, exclusive of anything older).
 *   - If the fixture has >= MIN_DATA_POINTS entries in that window, compute
 *     the average of each metric and round to 3 decimal places.
 *   - Otherwise, preserve the committed baseline value unchanged.
 *
 * Fixtures that appear only in the committed baseline (no history yet) keep
 * their committed values.
 */
export function computeRollingBaseline(
  history: HistoryEntry[],
  committed: BaselineEntry[],
  referenceDate = new Date(),
): BaselineEntry[] {
  // Build the window boundary: entries strictly newer than this date are in-window.
  // We compare ISO date strings (YYYY-MM-DD) which sort lexicographically.
  const windowStart = new Date(referenceDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - ROLLING_WINDOW_DAYS);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  // Filter entries that fall within the rolling window
  const inWindow = history.filter((e) => e.date > windowStartStr);

  return committed.map((committedEntry) => {
    // Collect per-date values for this fixture within the window
    const fixtureRuns: HistoryRun[] = [];
    for (const entry of inWindow) {
      const run = entry.runs.find(
        (r) => r.fixtureName === committedEntry.fixtureName,
      );
      if (run !== undefined) {
        fixtureRuns.push(run);
      }
    }

    if (fixtureRuns.length < MIN_DATA_POINTS) {
      // Not enough data — keep the committed baseline unchanged
      return committedEntry;
    }

    const n = fixtureRuns.length;
    const avg = (values: number[]): number => {
      const sum = values.reduce((acc, v) => acc + v, 0);
      return Math.round((sum / n) * 1000) / 1000;
    };

    return {
      fixtureName: committedEntry.fixtureName,
      correctnessRate: avg(fixtureRuns.map((r) => r.correctnessRate)),
      avgErrorRate: avg(fixtureRuns.map((r) => r.avgErrorRate)),
      avgToolCalls: avg(fixtureRuns.map((r) => r.avgToolCalls)),
      avgQuality: avg(fixtureRuns.map((r) => r.avgQuality)),
    };
  });
}
