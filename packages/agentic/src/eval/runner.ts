import { filter, firstValueFrom } from "rxjs";
import { createAgenticState } from "../createState";
import { Entry, StreamProvider } from "../types";
import { EvalFixture } from "./fixtures/console-error-and-network-failure";
import { EvalScore, QualityScores, scoreEvalRun } from "./scorer";

export interface EvalResult {
  fixtureName: string;
  prompt: string;
  runs: Array<EvalScore>;
  majorityCorrect: boolean;
  /** Fraction of runs that were correct (0–1). More precise than majorityCorrect. */
  correctnessRate: number;
  averageIterationDepth: number;
  averageToolErrorRate: number;
  anyHitIterationLimit: boolean;
  // Average of each quality dimension across all runs (1 decimal place)
  averageQualityScore: QualityScores;
}

export async function runSingle(
  fixture: EvalFixture,
  streamProvider: StreamProvider,
  apiKey: string,
): Promise<{ score: EvalScore; entries: Array<Entry> }> {
  const state = createAgenticState(streamProvider, fixture.accessor);

  // query() synchronously sets $loading to "reasoning", so we issue the
  // query first, then wait for loading to return to "none".
  state.query(fixture.prompt);

  await firstValueFrom(
    state.$loading.asObservable().pipe(filter((loading) => loading === "none")),
  );

  const entries = state.$entries.getValue();
  const score = await scoreEvalRun(
    entries,
    fixture.expectedOutcomeDescription,
    apiKey,
  );

  state.destroy();
  return { score, entries };
}

export async function runEval(
  fixture: EvalFixture,
  streamProvider: StreamProvider,
  apiKey: string,
  runsPerCase = 3,
  onRunComplete?: (score: EvalScore, entries: Array<Entry>) => Promise<void>,
): Promise<EvalResult> {
  // Run repetitions of this fixture sequentially — the LLM API rate-limits
  // when many requests from the same fixture fire simultaneously, which inflates
  // tool error counts and produces noisy results. Fixture-level parallelism
  // (see index.ts) already provides a meaningful speed-up.
  const scores: Array<EvalScore> = [];
  for (let i = 0; i < runsPerCase; i++) {
    const { score, entries } = await runSingle(fixture, streamProvider, apiKey);
    if (onRunComplete) {
      await onRunComplete(score, entries);
    }
    scores.push(score);
  }

  const correctCount = scores.filter((s) => s.correct).length;
  const majorityCorrect = correctCount > runsPerCase / 2;
  const correctnessRate = correctCount / runsPerCase;

  const averageIterationDepth =
    scores.reduce((sum, s) => sum + s.iterationDepth, 0) / scores.length;

  const averageToolErrorRate =
    scores.reduce((sum, s) => sum + s.toolErrorRate, 0) / scores.length;

  const anyHitIterationLimit = scores.some((s) => s.hitIterationLimit);

  // Average each quality dimension across all runs, rounded to 1 decimal place.
  // Cast back to 1|2|3 — the average is used for display/comparison, not as a
  // strict enum value, so we widen the type to number via a cast.
  const avgBrevity =
    Math.round(
      (scores.reduce((sum, s) => sum + s.qualityScore.brevity, 0) /
        scores.length) *
        10,
    ) / 10;
  const avgDirectness =
    Math.round(
      (scores.reduce((sum, s) => sum + s.qualityScore.directness, 0) /
        scores.length) *
        10,
    ) / 10;
  const avgSignalNoise =
    Math.round(
      (scores.reduce((sum, s) => sum + s.qualityScore.signalNoise, 0) /
        scores.length) *
        10,
    ) / 10;

  const averageQualityScore: QualityScores = {
    brevity: avgBrevity as QualityScores["brevity"],
    directness: avgDirectness as QualityScores["directness"],
    signalNoise: avgSignalNoise as QualityScores["signalNoise"],
  };

  return {
    fixtureName: fixture.name,
    prompt: fixture.prompt,
    runs: scores,
    majorityCorrect,
    correctnessRate,
    averageIterationDepth,
    averageToolErrorRate,
    anyHitIterationLimit,
    averageQualityScore,
  };
}

// Re-export EvalFixture from the canonical location so consumers only need
// to import from runner.
export type { EvalFixture };
