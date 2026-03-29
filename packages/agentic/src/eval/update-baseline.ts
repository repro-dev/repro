/**
 * Baseline update script for the agentic eval harness.
 *
 * This script:
 *   1. Reads packages/agentic/src/eval/history.json
 *   2. Computes rolling 7-day averages per fixture via computeRollingBaseline()
 *   3. Compares the result to the current baseline.json
 *   4. If they differ, writes the new baseline.json and outputs a markdown
 *      comparison table (printed to stdout) for use in the CI PR body.
 *   5. Exits 0 regardless of whether the baseline changed — callers inspect
 *      the exit code separately via `git diff --quiet`.
 *
 * Pure helper functions (diffBaselines, formatBaselineComparison,
 * formatBaselineComparisonMarkdown) are exported for unit testing.
 *
 * Usage (called from CI):
 *   tsx packages/agentic/src/eval/update-baseline.ts [--check]
 *
 * With --check, exits 1 if the baseline would change (used in CI to detect
 * whether a PR is needed) without writing any files.
 */

import * as fs from "fs";
import * as path from "path";
import { computeRollingBaseline, appendRunToHistory } from "./history";
import type { BaselineEntry } from "./regressions";
import type { HistoryEntry } from "./history";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const EVAL_DIR = __dirname;
const BASELINE_PATH = path.join(EVAL_DIR, "baseline.json");
const HISTORY_PATH = path.join(EVAL_DIR, "history.json");

// ---------------------------------------------------------------------------
// Held-out test fixtures — these are NEVER appended to training history
// ---------------------------------------------------------------------------

/**
 * The 6 held-out test fixtures that must not appear in training history.
 * Belt-and-suspenders guard: appendResults filters these out even if the
 * nightly workflow is accidentally run with --test-set args.
 */
export const TEST_FIXTURE_NAMES = new Set<string>([
  "websocket-message-missing",
  "form-validation-silent-failure",
  "multi-step-error-chain",
  "slow-session-no-errors",
  "dropdown-state-not-reset",
  "error-with-dom-side-effect",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaselineDiff {
  fixtureName: string;
  /** null when the fixture is new (not in old baseline) */
  old: BaselineEntry | null;
  updated: BaselineEntry;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Returns one diff entry per fixture that changed between `old` and `updated`.
 * New fixtures (present in `updated` but not `old`) are included with old = null.
 */
export function diffBaselines(
  old: BaselineEntry[],
  updated: BaselineEntry[],
): BaselineDiff[] {
  const oldMap = new Map(old.map((e) => [e.fixtureName, e]));
  const diffs: BaselineDiff[] = [];

  for (const entry of updated) {
    const prev = oldMap.get(entry.fixtureName) ?? null;
    if (prev === null) {
      // New fixture
      diffs.push({ fixtureName: entry.fixtureName, old: null, updated: entry });
      continue;
    }
    if (
      prev.correctnessRate !== entry.correctnessRate ||
      prev.avgErrorRate !== entry.avgErrorRate ||
      prev.avgToolCalls !== entry.avgToolCalls ||
      prev.avgQuality !== entry.avgQuality
    ) {
      diffs.push({ fixtureName: entry.fixtureName, old: prev, updated: entry });
    }
  }

  return diffs;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function num(n: number): string {
  return n.toFixed(3);
}

/**
 * Formats a plain-text summary of baseline changes for console output.
 */
export function formatBaselineComparison(diffs: BaselineDiff[]): string {
  if (diffs.length === 0) {
    return "No changes to baseline.";
  }

  const lines: string[] = ["Baseline changes:"];
  for (const diff of diffs) {
    const oldPart =
      diff.old === null
        ? "(new)"
        : `correctness=${pct(diff.old.correctnessRate)}, errorRate=${pct(
            diff.old.avgErrorRate,
          )}, toolCalls=${num(diff.old.avgToolCalls)}, quality=${num(
            diff.old.avgQuality,
          )}`;
    const newPart = `correctness=${pct(
      diff.updated.correctnessRate,
    )}, errorRate=${pct(diff.updated.avgErrorRate)}, toolCalls=${num(
      diff.updated.avgToolCalls,
    )}, quality=${num(diff.updated.avgQuality)}`;
    lines.push(`  ${diff.fixtureName}:`);
    lines.push(`    old: ${oldPart}`);
    lines.push(`    new: ${newPart}`);
  }
  return lines.join("\n");
}

/**
 * Formats a GitHub-flavoured Markdown table showing old vs new baseline values
 * per changed fixture. Used as the PR body in the baseline-update CI workflow.
 */
export function formatBaselineComparisonMarkdown(
  diffs: BaselineDiff[],
): string {
  if (diffs.length === 0) {
    return "No changes to baseline.";
  }

  const lines: string[] = [
    "## Baseline update",
    "",
    "Rolling 7-day averages differ from the committed `baseline.json`.",
    "",
    "| Fixture | Metric | Old | New |",
    "| --- | --- | --- | --- |",
  ];

  for (const diff of diffs) {
    const { fixtureName, old, updated } = diff;

    const rows: Array<[string, string, string]> = [
      [
        "Correctness rate",
        old !== null ? pct(old.correctnessRate) : "(new)",
        pct(updated.correctnessRate),
      ],
      [
        "Avg error rate",
        old !== null ? pct(old.avgErrorRate) : "(new)",
        pct(updated.avgErrorRate),
      ],
      [
        "Avg tool calls",
        old !== null ? num(old.avgToolCalls) : "(new)",
        num(updated.avgToolCalls),
      ],
      [
        "Avg quality",
        old !== null ? num(old.avgQuality) : "(new)",
        num(updated.avgQuality),
      ],
    ];

    for (const [metric, oldVal, newVal] of rows) {
      lines.push(`| ${fixtureName} | ${metric} | ${oldVal} | ${newVal} |`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// append-results sub-command
// ---------------------------------------------------------------------------

/**
 * Appends the current nightly results (from tmp/agentic-eval-results.json) to
 * history.json. Called by the nightly CI workflow after each eval run.
 *
 * The results file has the shape produced by index.ts:
 *   [{ fixtureName, correctnessRate, averageToolErrorRate, averageIterationDepth,
 *      averageQualityScore: { brevity, directness, signalNoise } }]
 */
function appendResults(
  resultsPath: string,
  historyPath: string,
  date: string,
): void {
  type RawResult = {
    fixtureName: string;
    correctnessRate: number;
    averageToolErrorRate: number;
    averageIterationDepth: number;
    averageQualityScore: {
      brevity: number;
      directness: number;
      signalNoise: number;
    };
  };

  const results = readJson<RawResult[]>(resultsPath);
  if (!results) {
    console.error(`Results file not found: ${resultsPath}`);
    process.exit(1);
  }

  // Filter out any held-out test fixtures — they must not contaminate history
  const trainingResults = results.filter(
    (r) => !TEST_FIXTURE_NAMES.has(r.fixtureName),
  );
  const skipped = results.length - trainingResults.length;
  if (skipped > 0) {
    console.warn(
      `Skipping ${skipped} test-set fixture(s) — test results are not appended to training history`,
    );
  }

  const existing = readJson<HistoryEntry[]>(historyPath) ?? [];

  const runs = trainingResults.map((r) => ({
    fixtureName: r.fixtureName,
    correctnessRate: r.correctnessRate,
    avgErrorRate: r.averageToolErrorRate,
    avgToolCalls: r.averageIterationDepth,
    avgQuality:
      Math.round(
        ((r.averageQualityScore.brevity +
          r.averageQualityScore.directness +
          r.averageQualityScore.signalNoise) /
          3) *
          1000,
      ) / 1000,
  }));

  const updated = appendRunToHistory(existing, runs, date);
  writeJson(historyPath, updated);
  console.log(
    `Appended ${runs.length} fixture(s) to history for ${date} (${updated.length} total entries)`,
  );
}

// ---------------------------------------------------------------------------
// update-baseline sub-command
// ---------------------------------------------------------------------------

function updateBaseline(checkOnly: boolean): void {
  const history = readJson<HistoryEntry[]>(HISTORY_PATH) ?? [];
  const committed = readJson<BaselineEntry[]>(BASELINE_PATH) ?? [];

  const updated = computeRollingBaseline(history, committed);
  const diffs = diffBaselines(committed, updated);

  console.log(formatBaselineComparison(diffs));

  if (diffs.length === 0) {
    console.log("Baseline is up to date — no PR needed.");
    process.exit(0);
  }

  // Print markdown for use in CI PR body
  console.log("\n---\nMarkdown (for PR body):\n");
  console.log(formatBaselineComparisonMarkdown(diffs));

  if (checkOnly) {
    // --check mode: signal "would change" without writing
    process.exit(1);
  }

  writeJson(BASELINE_PATH, updated);
  console.log(`\nWrote updated baseline to ${BASELINE_PATH}`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isEntryPoint =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("/update-baseline.ts") ||
    process.argv[1].endsWith("/update-baseline.js"));

if (isEntryPoint) {
  const subCommand = process.argv[2];
  const checkOnly = process.argv.includes("--check");

  if (subCommand === "append-results") {
    const resultsPath = process.argv[3];
    if (!resultsPath) {
      console.error("Usage: update-baseline.ts append-results <results-path>");
      process.exit(1);
    }
    const today = new Date().toISOString().slice(0, 10);
    appendResults(resultsPath, HISTORY_PATH, today);
  } else {
    // Default: update-baseline
    updateBaseline(checkOnly);
  }
}
