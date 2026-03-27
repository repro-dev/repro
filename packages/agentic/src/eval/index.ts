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
 * How to update the baseline:
 *   1. Run the evals locally and verify the results in tmp/agentic-eval-results.json
 *   2. Run: node -e "require('fs').writeFileSync(
 *        'packages/agentic/src/eval/baseline.json',
 *        JSON.stringify(
 *          JSON.parse(require('fs').readFileSync('tmp/agentic-eval-results.json','utf8'))
 *            .map(({fixtureName, correctnessRate, averageToolErrorRate, averageIterationDepth, averageQualityScore}) => ({
 *              fixtureName,
 *              correctnessRate,
 *              avgErrorRate: averageToolErrorRate,
 *              avgToolCalls: averageIterationDepth,
 *              avgQuality: parseFloat(((averageQualityScore.brevity + averageQualityScore.directness + averageQualityScore.signalNoise) / 3).toFixed(1)),
 *            })),
 *          null, 2
 *        ) + '\n'
 *      )"
 *   3. Commit baseline.json
 *
 * File overview:
 *   fixtures/          — Synthetic recordings paired with expected debug outcomes
 *   baseline.json      — Committed pass/fail expectations; CI fails on regression
 *   regressions.ts     — Pure regression detection logic (testable without CLI deps)
 *   streamProvider.ts  — StreamProvider that calls OpenRouter directly (bypasses API server)
 *   scorer.ts          — Extracts metrics and calls LLM-as-judge for correctness scoring
 *   runner.ts          — Orchestrates multiple runs per fixture, computes aggregate stats
 *   index.ts           — CLI entry point: runs all fixtures, prints results, writes JSON
 *
 * Full results (including per-run transcripts) are written to
 * tmp/agentic-eval-results.json (gitignored) and uploaded as a CI artifact by
 * the nightly evals workflow (.github/workflows/nightly-evals.yml).
 */

import * as fs from "fs";
import * as path from "path";
import { createFixture as createFixture1 } from "./fixtures/console-error-and-network-failure";
import { createFixture as createFixture2 } from "./fixtures/conditional-rendering-bug";
import { createFixture as createFixture3 } from "./fixtures/user-interaction-state-change";
import { suggestPromptImprovements } from "./promptCritic";
import { BaselineEntry, RegressionEntry, findRegressions } from "./regressions";
import { EvalResult, runEval } from "./runner";
import { createOpenRouterStreamProvider } from "./streamProvider";
import { SYSTEM_CARD_MESSAGE } from "../model/system";
import { tools } from "../model/tools";

// Resolve the workspace root so we can write into tmp/ (gitignored, shared
// scratch space). __dirname under tsx points to packages/agentic/src/eval —
// walk up 4 levels to reach the workspace root.
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const RESULTS_PATH = path.join(
  WORKSPACE_ROOT,
  "tmp",
  "agentic-eval-results.json",
);
const BASELINE_PATH = path.join(__dirname, "baseline.json");
const SUGGESTIONS_PATH = path.join(
  WORKSPACE_ROOT,
  "tmp",
  "agentic-prompt-suggestions.md",
);

const suggestImprovements = process.argv.includes("--suggest-improvements");

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function avg(n: number): string {
  return n.toFixed(1);
}

function printResults(results: Array<EvalResult>): void {
  const rows = results.map((r) => {
    const { brevity, directness, signalNoise } = r.averageQualityScore;
    const compositeQuality = ((brevity + directness + signalNoise) / 3).toFixed(
      1,
    );
    return {
      Fixture: r.fixtureName,
      Result: r.majorityCorrect ? "PASS" : "FAIL",
      "Correctness Rate": pct(r.correctnessRate),
      "Avg Tool Calls": avg(r.averageIterationDepth),
      "Avg Error Rate": pct(r.averageToolErrorRate),
      "Avg Quality": compositeQuality,
    };
  });
  console.log("\nSummary:");
  console.table(rows);
}

function printRegressionReport(
  regressions: Array<RegressionEntry>,
  results: Array<EvalResult>,
  baseline: Array<BaselineEntry>,
): void {
  const baselineMap = new Map(baseline.map((b) => [b.fixtureName, b]));

  // New fixtures (no baseline entry)
  const newFixtures = results.filter((r) => !baselineMap.has(r.fixtureName));
  if (newFixtures.length > 0) {
    console.log("\nNew fixtures (no baseline):");
    for (const r of newFixtures) {
      console.log(`  ${r.fixtureName}: ${r.majorityCorrect ? "PASS" : "FAIL"}`);
    }
  }

  if (regressions.length === 0) {
    console.log("\nBaseline comparison: no regressions detected.");
    return;
  }

  console.error(`\nBaseline comparison: ${regressions.length} regression(s):`);
  for (const reg of regressions) {
    const detail = formatRegressionDetail(reg);
    console.error(`  REGRESSED  ${reg.fixtureName}  [${reg.metric}] ${detail}`);
  }
  console.error(
    "\nTo update the baseline after an intentional change, see the instructions at the top of index.ts.",
  );
}

function formatRegressionDetail(reg: RegressionEntry): string {
  switch (reg.metric) {
    case "correctnessRate":
      return `correctness dropped ${pct(reg.baseline)} → ${pct(
        reg.current,
      )} (Δ −${pct(reg.delta)})`;
    case "avgErrorRate":
      return `error rate rose ${pct(reg.baseline)} → ${pct(
        reg.current,
      )} (exceeded threshold by ${pct(reg.delta)})`;
    case "avgToolCalls":
      return `tool calls rose ${avg(reg.baseline)} → ${avg(
        reg.current,
      )} (exceeded threshold by ${avg(reg.delta)})`;
    case "avgQuality":
      return `quality dropped ${avg(reg.baseline)} → ${avg(
        reg.current,
      )} (Δ −${avg(reg.delta)})`;
  }
}

function formatSuggestionsMarkdown(
  suggestions: Array<{
    target: string;
    currentText: string;
    suggestedText: string;
    rationale: string;
  }>,
  fixtureCount: number,
): string {
  const timestamp = new Date().toISOString();
  const header = [
    "# Prompt Improvement Suggestions",
    "",
    `Generated: ${timestamp}`,
    `Fixtures run: ${fixtureCount}`,
    "",
    "---",
  ].join("\n");

  if (suggestions.length === 0) {
    return header + "\n\nNo suggestions generated.";
  }

  const sections = suggestions.map((s, i) =>
    [
      `## Suggestion ${i + 1}: ${s.target}`,
      "",
      `**Rationale:** ${s.rationale}`,
      "",
      "**Current:**",
      "```",
      s.currentText,
      "```",
      "",
      "**Suggested:**",
      "```",
      s.suggestedText,
      "```",
      "",
      "---",
    ].join("\n"),
  );

  return [header, "", ...sections].join("\n");
}

async function main(): Promise<void> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  // Load baseline if present — missing baseline is not an error (first run)
  let baseline: Array<BaselineEntry> = [];
  if (fs.existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(
      fs.readFileSync(BASELINE_PATH, "utf8"),
    ) as Array<BaselineEntry>;
  } else {
    console.warn(
      "No baseline.json found — regression detection disabled for this run.",
    );
  }

  const streamProvider = createOpenRouterStreamProvider(apiKey);
  const fixtures = [createFixture1(), createFixture2(), createFixture3()];
  const runsPerCase = 3;

  // Run all fixtures in parallel. Progress lines are buffered per-fixture and
  // printed atomically on completion to avoid interleaved output.
  console.log(
    `\nRunning ${fixtures.length} fixtures × ${runsPerCase} runs in parallel...`,
  );

  const results = await Promise.all(
    fixtures.map(async (fixture) => {
      const result = await runEval(
        fixture,
        streamProvider,
        apiKey,
        runsPerCase,
      );

      // Buffer this fixture's output and flush atomically
      const lines: Array<string> = [`\nFixture: ${fixture.name}`];
      let runIndex = 0;
      for (const run of result.runs) {
        runIndex++;
        const status = run.correct ? "✓ correct" : "✗ incorrect";
        lines.push(
          `  Run ${runIndex}/${runsPerCase}... ${status} (${
            run.iterationDepth
          } tool calls, ${pct(run.toolErrorRate)} errors)`,
        );
      }
      const correctCount = result.runs.filter((r) => r.correct).length;
      const overallStatus = result.majorityCorrect ? "PASS" : "FAIL";
      lines.push(
        `  Result: ${overallStatus} (${correctCount}/${runsPerCase} correct, ${pct(
          result.correctnessRate,
        )} rate) — avg ${avg(
          result.averageIterationDepth,
        )} tool calls, avg ${pct(result.averageToolErrorRate)} error rate`,
      );
      console.log(lines.join("\n"));

      return result;
    }),
  );

  printResults(results);

  // Write full results (with transcripts) to tmp/ for local inspection and CI artifact upload
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(
    `\nFull results written to ${path.relative(process.cwd(), RESULTS_PATH)}`,
  );

  // Optional: call prompt-critic LLM to suggest improvements to the system prompt
  // and tool descriptions based on eval signals. Triggered by --suggest-improvements.
  if (suggestImprovements) {
    const toolDescriptions = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
    }));
    const suggestions = await suggestPromptImprovements(
      SYSTEM_CARD_MESSAGE,
      toolDescriptions,
      results,
      apiKey,
    );
    const markdown = formatSuggestionsMarkdown(suggestions, results.length);
    fs.writeFileSync(SUGGESTIONS_PATH, markdown);
    console.log(
      `\nPrompt suggestions written to ${path.relative(
        process.cwd(),
        SUGGESTIONS_PATH,
      )}`,
    );
  }

  // Regression check against committed baseline
  const snapshots = results.map((r) => {
    const { brevity, directness, signalNoise } = r.averageQualityScore;
    return {
      fixtureName: r.fixtureName,
      correctnessRate: r.correctnessRate,
      averageToolErrorRate: r.averageToolErrorRate,
      averageIterationDepth: r.averageIterationDepth,
      compositeQualityScore: (brevity + directness + signalNoise) / 3,
    };
  });
  const regressions = findRegressions(snapshots, baseline);
  printRegressionReport(regressions, results, baseline);

  if (regressions.length > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Eval harness failed:", err);
  process.exit(1);
});
