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
 *        export function createFixture(): EvalFixture
 *      where EvalFixture is imported from ~/eval/runner and includes
 *      systemPrompt and promptExportName fields.
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
 *   streamProvider.ts  — StreamProvider factory that calls OpenRouter directly (bypasses API server)
 *   scorer.ts          — Extracts metrics and calls LLM-as-judge for correctness scoring
 *   runner.ts          — Orchestrates multiple runs per fixture, computes aggregate stats
 *   introspector.ts    — Per-run critique LLM call; produces CritiqueItem[] linking behaviour to prompt causes
 *   promptCritic.ts    — Post-run synthesis: aggregates all critique findings and proposes ready-to-apply prompt edits
 *   index.ts           — CLI entry point: runs all fixtures, prints results, writes JSON; --analyse flag runs the full critique + suggestion pipeline
 *
 * Full results (including per-run transcripts) are written to
 * tmp/agentic-eval-results.json (gitignored) and uploaded as a CI artifact by
 * the nightly evals workflow (.github/workflows/nightly-evals.yml).
 */

import * as fs from 'fs'
import * as path from 'path'
import { tools } from '../model/tools'
import type { Entry } from '../types'
import { createFixture as createFixture1 } from './fixtures/console-error-and-network-failure'
import { createFixture as createFixture2 } from './fixtures/conditional-rendering-bug'
import { createFixture as createFixture3 } from './fixtures/user-interaction-state-change'
import { critiqueRun, type CritiqueItem } from './introspector'
import { suggestPromptImprovements, type PromptSuggestion } from './promptCritic'
import { BaselineEntry, RegressionEntry, findRegressions } from './regressions'
import type { EvalScore } from './scorer'
import { EvalFixture, EvalResult, runEval } from './runner'
import { createOpenRouterStreamProvider } from './streamProvider'

// Resolve the workspace root so we can write into tmp/ (gitignored, shared
// scratch space). __dirname under tsx points to packages/agentic/src/eval —
// walk up 4 levels to reach the workspace root.
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const RESULTS_PATH = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'agentic-eval-results.json',
)
const BASELINE_PATH = path.join(__dirname, 'baseline.json')
const ANALYSIS_PATH = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'agentic-prompt-suggestions.md',
)

// Exported for testing: groups critiquesByFixture entries by promptExportName.
// Returns a Map from promptExportName → { systemPrompt, entries }.
export function buildPromptGroups(
  fixtures: Array<EvalFixture>,
  critiquesByFixture: Array<{
    fixtureName: string
    runs: Array<{ runIndex: number; correct: boolean; critiques: Array<CritiqueItem> }>
  }>,
): Map<
  string,
  {
    systemPrompt: string
    entries: Array<{
      fixtureName: string
      runs: Array<{ runIndex: number; correct: boolean; critiques: Array<CritiqueItem> }>
    }>
  }
> {
  const promptGroups = new Map<
    string,
    {
      systemPrompt: string
      entries: Array<{
        fixtureName: string
        runs: Array<{
          runIndex: number
          correct: boolean
          critiques: Array<CritiqueItem>
        }>
      }>
    }
  >()
  for (const [idx, entry] of critiquesByFixture.entries()) {
    const fixture = fixtures[idx]!
    const key = fixture.promptExportName
    if (!promptGroups.has(key)) {
      promptGroups.set(key, { systemPrompt: fixture.systemPrompt, entries: [] })
    }
    promptGroups.get(key)!.entries.push(entry)
  }
  return promptGroups
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function avg(n: number): string {
  return n.toFixed(1)
}

function printResults(results: Array<EvalResult>): void {
  // Determine whether any result has critique data — only show the column when
  // --analyse mode was used and at least one run has critique items.
  const hasCritiques = results.some(r =>
    r.runs.some(run => run.critique !== undefined),
  )

  const rows = results.map(r => {
    const { brevity, directness, signalNoise } = r.averageQualityScore
    const compositeQuality = ((brevity + directness + signalNoise) / 3).toFixed(
      1,
    )
    const row: Record<string, string | number> = {
      Fixture: r.fixtureName,
      Result: r.majorityCorrect ? 'PASS' : 'FAIL',
      'Correctness Rate': pct(r.correctnessRate),
      'Avg Tool Calls': avg(r.averageIterationDepth),
      'Avg Error Rate': pct(r.averageToolErrorRate),
      'Avg Quality': compositeQuality,
    }
    if (hasCritiques) {
      const totalCritiques = r.runs.reduce(
        (sum, run) => sum + (run.critique?.length ?? 0),
        0,
      )
      row['Critique Items'] = totalCritiques
    }
    return row
  })
  console.log('\nSummary:')
  console.table(rows)
}

function printRegressionReport(
  regressions: Array<RegressionEntry>,
  results: Array<EvalResult>,
  baseline: Array<BaselineEntry>,
): void {
  const baselineMap = new Map(baseline.map(b => [b.fixtureName, b]))

  // New fixtures (no baseline entry)
  const newFixtures = results.filter(r => !baselineMap.has(r.fixtureName))
  if (newFixtures.length > 0) {
    console.log('\nNew fixtures (no baseline):')
    for (const r of newFixtures) {
      console.log(`  ${r.fixtureName}: ${r.majorityCorrect ? 'PASS' : 'FAIL'}`)
    }
  }

  if (regressions.length === 0) {
    console.log('\nBaseline comparison: no regressions detected.')
    return
  }

  console.error(`\nBaseline comparison: ${regressions.length} regression(s):`)
  for (const reg of regressions) {
    const detail = formatRegressionDetail(reg)
    console.error(`  REGRESSED  ${reg.fixtureName}  [${reg.metric}] ${detail}`)
  }
  console.error(
    '\nTo update the baseline after an intentional change, see the instructions at the top of index.ts.',
  )
}

function formatRegressionDetail(reg: RegressionEntry): string {
  switch (reg.metric) {
    case 'correctnessRate':
      return `correctness dropped ${pct(reg.baseline)} → ${pct(
        reg.current,
      )} (Δ −${pct(reg.delta)})`
    case 'avgErrorRate':
      return `error rate rose ${pct(reg.baseline)} → ${pct(
        reg.current,
      )} (exceeded threshold by ${pct(reg.delta)})`
    case 'avgToolCalls':
      return `tool calls rose ${avg(reg.baseline)} → ${avg(
        reg.current,
      )} (exceeded threshold by ${avg(reg.delta)})`
    case 'avgQuality':
      return `quality dropped ${avg(reg.baseline)} → ${avg(
        reg.current,
      )} (Δ −${avg(reg.delta)})`
  }
}

function printCritiques(results: Array<EvalResult>): void {
  const hasCritiques = results.some(r =>
    r.runs.some(run => (run.critique?.length ?? 0) > 0),
  )
  if (!hasCritiques) {
    return
  }
  console.log('\nCritique findings:')
  for (const r of results) {
    for (const [runIdx, run] of r.runs.entries()) {
      if (!run.critique || run.critique.length === 0) continue
      console.log(
        `\n  ${r.fixtureName} — run ${runIdx + 1} (${run.correct ? 'correct' : 'incorrect'}):`,
      )
      for (const [i, item] of run.critique.entries()) {
        console.log(`    [${i + 1}] ${item.issue}`)
        console.log(`        Likely cause: ${item.likelyPromptCause}`)
        console.log(`        Suggestion:   ${item.suggestion}`)
      }
    }
  }
}

function formatSuggestionsMarkdown(
  suggestions: Array<PromptSuggestion>,
  fixtureCount: number,
): string {
  const timestamp = new Date().toISOString()
  const header = [
    '# Prompt Improvement Suggestions',
    '',
    `Generated: ${timestamp}`,
    `Fixtures run: ${fixtureCount}`,
    '',
    '---',
  ].join('\n')

  if (suggestions.length === 0) {
    return header + '\n\nNo suggestions generated.'
  }

  const sections = suggestions.map((s, i) =>
    [
      `## Suggestion ${i + 1}: ${s.target}`,
      '',
      `**Rationale:** ${s.rationale}`,
      '',
      '**Current:**',
      '```',
      s.currentText,
      '```',
      '',
      '**Suggested:**',
      '```',
      s.suggestedText,
      '```',
      '',
      '---',
    ].join('\n'),
  )

  return [header, '', ...sections].join('\n')
}

function printSuggestions(suggestions: Array<PromptSuggestion>): void {
  if (suggestions.length === 0) {
    console.log('\nPrompt critic: no suggestions generated.')
    return
  }
  console.log(`\nPrompt suggestions (${suggestions.length}):`)
  for (const [i, s] of suggestions.entries()) {
    console.log(`\n  [${i + 1}] ${s.target}`)
    console.log(`  Rationale: ${s.rationale}`)
    console.log(`  Current:   ${s.currentText}`)
    console.log(`  Suggested: ${s.suggestedText}`)
  }
}

async function main(): Promise<void> {
  const apiKey = process.env['OPENROUTER_API_KEY']
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY environment variable is required')
    process.exit(1)
  }

  const analyse = process.argv.includes('--analyse')

  // Load baseline if present — missing baseline is not an error (first run)
  let baseline: Array<BaselineEntry> = []
  if (fs.existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(
      fs.readFileSync(BASELINE_PATH, 'utf8'),
    ) as Array<BaselineEntry>
  } else {
    console.warn(
      'No baseline.json found — regression detection disabled for this run.',
    )
  }

  const streamProviderFactory = createOpenRouterStreamProvider(apiKey)
  const fixtures = [createFixture1(), createFixture2(), createFixture3()]
  const runsPerCase = 3

  // Build tool descriptions from the registered tools array.
  // tools[] has shape: { type: 'function', function: { name, description, parameters } }
  const toolDescriptions = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
  }))

  // Run all fixtures in parallel. Progress lines are buffered per-fixture and
  // printed atomically on completion to avoid interleaved output.
  console.log(
    `\nRunning ${fixtures.length} fixtures × ${runsPerCase} runs in parallel...`,
  )
  if (analyse) {
    console.log(
      'Analyse mode enabled — per-run critique calls will be made, then prompt suggestions synthesised.',
    )
  }

  // Per-fixture critique accumulator, keyed by fixture index. Populated in
  // onRunComplete when --analyse is active.
  const critiquesByFixture: Array<{
    fixtureName: string
    runs: Array<{ runIndex: number; correct: boolean; critiques: Array<CritiqueItem> }>
  }> = []

  const results = await Promise.all(
    fixtures.map(async (fixture, fixtureIndex) => {
      // Buffer this fixture's output and flush atomically
      const lines: Array<string> = [`\nFixture: ${fixture.name}`]

      const fixtureRuns: Array<{
        runIndex: number
        correct: boolean
        critiques: Array<CritiqueItem>
      }> = []
      let runIndex = 0

      const onRunComplete = analyse
        ? async (score: EvalScore, entries: Array<Entry>) => {
            const currentRunIndex = runIndex++
            const critiques = await critiqueRun(
              entries,
              fixture.systemPrompt,
              toolDescriptions,
              score,
              fixture.expectedOutcomeDescription,
              apiKey,
            )
            score.critique = critiques
            fixtureRuns.push({
              runIndex: currentRunIndex,
              correct: score.correct,
              critiques,
            })
            if (critiques.length > 0) {
              lines.push(`  Critique: ${critiques.length} item(s)`)
            }
          }
        : undefined

      const result = await runEval(
        fixture,
        streamProviderFactory,
        apiKey,
        runsPerCase,
        onRunComplete,
      )

      critiquesByFixture[fixtureIndex] = {
        fixtureName: fixture.name,
        runs: fixtureRuns,
      }

      let displayRunIndex = 0
      for (const run of result.runs) {
        displayRunIndex++
        const status = run.correct ? '✓ correct' : '✗ incorrect'
        lines.push(
          `  Run ${displayRunIndex}/${runsPerCase}... ${status} (${
            run.iterationDepth
          } tool calls, ${pct(run.toolErrorRate)} errors)`,
        )
      }
      const correctCount = result.runs.filter(r => r.correct).length
      const overallStatus = result.majorityCorrect ? 'PASS' : 'FAIL'
      lines.push(
        `  Result: ${overallStatus} (${correctCount}/${runsPerCase} correct, ${pct(
          result.correctnessRate,
        )} rate) — avg ${avg(
          result.averageIterationDepth,
        )} tool calls, avg ${pct(result.averageToolErrorRate)} error rate`,
      )
      console.log(lines.join('\n'))

      return result
    }),
  )

  printResults(results)
  if (analyse) {
    printCritiques(results)
  }

  // Write full results (with transcripts) to tmp/ for local inspection and CI artifact upload
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
  console.log(
    `\nFull results written to ${path.relative(process.cwd(), RESULTS_PATH)}`,
  )

  // When --analyse is active, run the prompt critic against the aggregated
  // critique findings. Group by promptExportName so each distinct prompt gets
  // its own critic call — suggestions are scoped to the correct prompt export.
  if (analyse) {
    const promptGroups = buildPromptGroups(fixtures, critiquesByFixture)

    const allSuggestions: Array<PromptSuggestion> = []
    for (const [promptExportName, { systemPrompt, entries }] of promptGroups) {
      const groupSuggestions = await suggestPromptImprovements(
        systemPrompt,
        toolDescriptions,
        entries,
        apiKey,
        promptExportName,
      )
      allSuggestions.push(...groupSuggestions)
    }

    const markdown = formatSuggestionsMarkdown(allSuggestions, results.length)
    fs.writeFileSync(ANALYSIS_PATH, markdown)
    printSuggestions(allSuggestions)
    console.log(
      `\nPrompt suggestions written to ${path.relative(
        process.cwd(),
        ANALYSIS_PATH,
      )}`,
    )
  }

  // Regression check against committed baseline
  const snapshots = results.map(r => {
    const { brevity, directness, signalNoise } = r.averageQualityScore
    return {
      fixtureName: r.fixtureName,
      correctnessRate: r.correctnessRate,
      averageToolErrorRate: r.averageToolErrorRate,
      averageIterationDepth: r.averageIterationDepth,
      compositeQualityScore: (brevity + directness + signalNoise) / 3,
    }
  })
  const regressions = findRegressions(snapshots, baseline)
  printRegressionReport(regressions, results, baseline)

  if (regressions.length > 0) {
    process.exit(1)
  }
}

// Only run main() when this file is the direct entry point, not when imported
// by test files (e.g. index.test.ts imports buildPromptGroups).
const isEntryPoint =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/index.ts') ||
    process.argv[1].endsWith('/index.js'))

if (isEntryPoint) {
  main().catch((err: unknown) => {
    console.error('Eval harness failed:', err)
    process.exit(1)
  })
}
