/**
 * Agentic eval harness
 *
 * How to run:
 *   OPENROUTER_API_KEY=<key> moon run repro/agentic:eval
 *   # or directly:
 *   OPENROUTER_API_KEY=<key> tsx packages/agentic/src/eval/index.ts
 *
 * How to add a new eval case:
 *   1. Create a fixture file in src/eval/fixtures/ that exports:
 *        export interface EvalFixture { name, prompt, expectedOutcomeDescription, accessor }
 *        export function createFixture(): EvalFixture
 *   2. Import createFixture in this file and add the result to the `fixtures` array below.
 *
 * File overview:
 *   fixtures/          — Synthetic recordings paired with expected debug outcomes
 *   streamProvider.ts  — StreamProvider that calls OpenRouter directly (bypasses API server)
 *   scorer.ts          — Extracts metrics and calls LLM-as-judge for correctness scoring
 *   runner.ts          — Orchestrates multiple runs per fixture, computes aggregate stats
 *   index.ts           — CLI entry point: runs all fixtures, prints results, writes JSON
 *
 * Results are written to packages/agentic/eval-results.json (gitignored) for
 * baseline tracking. The file is also uploaded as a CI artifact by the nightly
 * evals workflow (.github/workflows/nightly-evals.yml).
 */

import * as fs from "fs";
import * as path from "path";
import { createFixture as createFixture1 } from "./fixtures/console-error-and-network-failure";
import { createFixture as createFixture2 } from "./fixtures/conditional-rendering-bug";
import { createFixture as createFixture3 } from "./fixtures/user-interaction-state-change";
import { EvalResult, runEval } from "./runner";
import { createOpenRouterStreamProvider } from "./streamProvider";

// Resolve the package root so we can write eval-results.json next to moon.yml.
// __dirname is the compiled output dir; for src-direct tsx execution it points
// to packages/agentic/src/eval — walk up 3 levels to reach packages/agentic.
const PACKAGE_ROOT = path.resolve(__dirname, "..", "..", "..");
const RESULTS_PATH = path.join(PACKAGE_ROOT, "eval-results.json");

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function avg(n: number): string {
  return n.toFixed(1);
}

function printResults(results: Array<EvalResult>): void {
  // Column widths
  const COL_FIXTURE = 37;
  const COL_RESULT = 6;
  const COL_CALLS = 12;
  const COL_ERRORS = 10;

  const hr = (
    left: string,
    _mid: string,
    right: string,
    sep: string,
    fill: string,
  ) =>
    left +
    fill.repeat(COL_FIXTURE + 2) +
    sep +
    fill.repeat(COL_RESULT + 2) +
    sep +
    fill.repeat(COL_CALLS + 2) +
    sep +
    fill.repeat(COL_ERRORS + 2) +
    right;

  const row = (
    fixture: string,
    result: string,
    calls: string,
    errors: string,
  ) =>
    `│ ${fixture.padEnd(COL_FIXTURE)} │ ${result.padEnd(
      COL_RESULT,
    )} │ ${calls.padEnd(COL_CALLS)} │ ${errors.padEnd(COL_ERRORS)} │`;

  console.log("\nSummary:");
  console.log(hr("┌", "┬", "┐", "┬", "─"));
  console.log(row("Fixture", "Result", "Avg Tool Calls", "Avg Errors"));
  console.log(hr("├", "┼", "┤", "┼", "─"));

  for (const r of results) {
    const resultLabel = r.majorityCorrect ? "PASS" : "FAIL";
    console.log(
      row(
        r.fixtureName,
        resultLabel,
        avg(r.averageIterationDepth),
        pct(r.averageToolErrorRate),
      ),
    );
  }

  console.log(hr("└", "┴", "┘", "┴", "─"));
}

async function main(): Promise<void> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const streamProvider = createOpenRouterStreamProvider(apiKey);
  const fixtures = [createFixture1(), createFixture2(), createFixture3()];
  const results: Array<EvalResult> = [];

  for (const fixture of fixtures) {
    console.log(`\nRunning eval: ${fixture.name}`);
    const runsPerCase = 3;

    // Run the fixture and stream per-run output as we go
    let runIndex = 0;

    const result = await runEval(fixture, streamProvider, apiKey, runsPerCase);

    // Print individual run summaries (best-effort: we have them after the fact)
    for (const run of result.runs) {
      runIndex++;
      const status = run.correct ? "✓ correct" : "✗ incorrect";
      const errorPct = pct(run.toolErrorRate);
      console.log(
        `  Run ${runIndex}/${runsPerCase}... ${status} (${run.iterationDepth} tool calls, ${errorPct} errors)`,
      );
    }

    const correctCount = result.runs.filter((r) => r.correct).length;
    const overallStatus = result.majorityCorrect ? "PASS" : "FAIL";
    console.log(
      `  Result: ${overallStatus} (${correctCount}/${runsPerCase} correct) — avg ${avg(
        result.averageIterationDepth,
      )} tool calls, avg ${pct(result.averageToolErrorRate)} error rate`,
    );

    results.push(result);
  }

  printResults(results);

  // Write results to disk for baseline tracking
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(
    `\nBaseline recorded to ${path.relative(process.cwd(), RESULTS_PATH)}`,
  );

  // Exit with non-zero code if any fixture failed the majority vote
  const anyFailed = results.some((r) => !r.majorityCorrect);
  if (anyFailed) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Eval harness failed:", err);
  process.exit(1);
});
