import { filter, firstValueFrom } from "rxjs";
import { createAgenticState } from "../createState";
import { StreamProvider } from "../types";
import { EvalFixture } from "./fixtures/console-error-and-network-failure";
import { EvalScore, scoreEvalRun } from "./scorer";

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
}

export async function runEval(
  fixture: EvalFixture,
  streamProvider: StreamProvider,
  apiKey: string,
  runsPerCase = 3,
): Promise<EvalResult> {
  const scores: Array<EvalScore> = [];

  for (let i = 0; i < runsPerCase; i++) {
    const state = createAgenticState(streamProvider, fixture.accessor);

    // query() synchronously sets $loading to "reasoning", so we issue the
    // query first, then wait for loading to return to "none".
    state.query(fixture.prompt);

    await firstValueFrom(
      state.$loading
        .asObservable()
        .pipe(filter((loading) => loading === "none")),
    );

    const entries = state.$entries.getValue();
    const score = await scoreEvalRun(
      entries,
      fixture.expectedOutcomeDescription,
      apiKey,
    );
    scores.push(score);

    state.destroy();
  }

  const correctCount = scores.filter((s) => s.correct).length;
  const majorityCorrect = correctCount > runsPerCase / 2;
  const correctnessRate = correctCount / runsPerCase;

  const averageIterationDepth =
    scores.reduce((sum, s) => sum + s.iterationDepth, 0) / scores.length;

  const averageToolErrorRate =
    scores.reduce((sum, s) => sum + s.toolErrorRate, 0) / scores.length;

  const anyHitIterationLimit = scores.some((s) => s.hitIterationLimit);

  return {
    fixtureName: fixture.name,
    prompt: fixture.prompt,
    runs: scores,
    majorityCorrect,
    correctnessRate,
    averageIterationDepth,
    averageToolErrorRate,
    anyHitIterationLimit,
  };
}

// Re-export EvalFixture from the canonical location so consumers only need
// to import from runner.
export type { EvalFixture };
