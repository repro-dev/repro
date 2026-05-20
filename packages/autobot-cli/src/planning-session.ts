import { spawn } from "node:child_process";
import path from "node:path";

import { Future, chain, fork, resolve, type FutureInstance } from "fluture";

import type {
  ArtifactKind,
  DomainEvent,
  ItemDetail,
  RepoRef,
} from "@repro/autobot-core";
import type { AutobotStore } from "@repro/autobot-store";

import type { SingleTrackPhaseContractName } from "./phase-contracts";
import { renderSingleTrackPhaseContract } from "./phase-contracts";

type PlanningArtifactDraft = {
  kind: ArtifactKind;
  path: string;
  description: string;
  content: string;
  content_hash: string;
  persist?: boolean;
};

export type PlanningSessionArtifactPaths = {
  context: string;
  testPlan: string;
  contract: string;
  runPlan: string;
  prompt: string;
};

export type PlanningSessionInput = {
  phase?: SingleTrackPhaseContractName;
  repo: RepoRef;
  issueId: string;
  attempt: number;
  runId: string;
  executionId: string;
  artifactPaths: PlanningSessionArtifactPaths;
};

export type PlanningSessionCommand = {
  command: string;
  args: string[];
};

export type PlanningSessionResult = PlanningSessionCommand & {
  started_at: string;
  finished_at: string;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type PlanningSessionRunner = (
  input: PlanningSessionInput,
) => FutureInstance<unknown, PlanningSessionResult>;

type PlanningPhaseFailure = {
  state: "awaiting" | "failed" | "escalated";
  code: string;
  message: string;
  occurred_at: string;
};

export type PlanningPhaseSequenceResult = {
  artifacts: PlanningArtifactDraft[];
  events: DomainEvent[];
  finalSessionResult: PlanningSessionResult;
  planningRunPlanValid: boolean;
  planningRunPlanReady: boolean;
  failure: PlanningPhaseFailure | null;
};

function buildPlanningSessionPrompt(input: PlanningSessionInput): string {
  return renderSingleTrackPhaseContract(input.phase ?? "plan", {
    issueId: input.issueId,
    attempt: input.attempt,
  });
}

export function buildOpenCodePlanningCommand(
  input: PlanningSessionInput,
): PlanningSessionCommand {
  return {
    command: "opencode",
    args: [
      "run",
      "--agent",
      "planner",
      "--dir",
      input.repo.path,
      "--title",
      `Autobot ${input.phase ?? "plan"} ${input.issueId}`,
      buildPlanningSessionPrompt(input),
      "--file",
      input.artifactPaths.context,
      "--file",
      input.artifactPaths.testPlan,
      "--file",
      input.artifactPaths.contract,
      "--file",
      input.artifactPaths.prompt,
    ],
  };
}

function buildPlanningSessionResult(
  command: PlanningSessionCommand,
  startedAt: string,
  finishedAt: string,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
): PlanningSessionResult {
  return {
    ...command,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: exitCode,
    signal,
    stdout,
    stderr,
  };
}

export function runOpenCodePlanningSession(
  input: PlanningSessionInput,
): FutureInstance<unknown, PlanningSessionResult> {
  const command = buildOpenCodePlanningCommand(input);

  return Future((reject, resolveFuture) => {
    const startedAt = new Date().toISOString();
    const child = spawn(command.command, command.args, {
      cwd: input.repo.path,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      resolveFuture(
        buildPlanningSessionResult(
          command,
          startedAt,
          new Date().toISOString(),
          exitCode,
          signal,
          stdout,
          stderr,
        ),
      );
    });

    return () => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
    };
  });
}

export function runPlanningPhaseSequence(input: {
  store: AutobotStore;
  item: ItemDetail;
  runId: string;
  executionId: string;
  startedAt: string;
  artifactWriter: (input: {
    path: string;
    content: string;
  }) => FutureInstance<unknown, void>;
  artifactReader: (input: { path: string }) => FutureInstance<unknown, string>;
  planningSessionRunner: PlanningSessionRunner;
}): FutureInstance<unknown, PlanningPhaseSequenceResult> {
  return Future((reject, resolveFuture) => {
    void import("./services")
      .then((services) => {
        const baseArtifacts = services.buildPlanningBaseArtifactDrafts({
          repoPath: input.store.repo.path,
          item: input.item,
          runId: input.runId,
          executionId: input.executionId,
          startedAt: input.startedAt,
        });
        const baseEvents = baseArtifacts.map((artifact) =>
          services.createPlanningArtifactCreatedEvent({
            issueId: input.item.issue_id,
            runId: input.runId,
            executionId: input.executionId,
            artifact,
            occurredAt: input.startedAt,
          }),
        );
        const contextArtifact = baseArtifacts[0]!;
        const testPlanArtifact = baseArtifacts[1]!;
        const contextPath = path.join(
          input.store.repo.path,
          contextArtifact.path,
        );
        const phaseOrder = ["plan"] as const;

        const sequence = services
          .persistPlanningArtifacts(
            baseArtifacts,
            input.artifactWriter,
            input.store.repo.path,
          )
          .pipe(
            chain(() =>
              Future((phaseReject, phaseResolve) => {
                const artifacts = [...baseArtifacts];
                const events = [...baseEvents];

                const runPhase = (index: number): void => {
                  if (index >= phaseOrder.length) {
                    phaseResolve({
                      artifacts,
                      events,
                      finalSessionResult: {
                        command: "opencode",
                        args: [],
                        started_at: input.startedAt,
                        finished_at: input.startedAt,
                        exit_code: 0,
                        signal: null,
                        stdout: "",
                        stderr: "",
                      },
                      planningRunPlanValid: true,
                      planningRunPlanReady: true,
                      failure: null,
                    });
                    return;
                  }

                  const phase = phaseOrder[index];
                  if (phase === undefined) {
                    phaseReject(
                      new Error(
                        "planning phase order was exhausted unexpectedly",
                      ),
                    );
                    return;
                  }

                  const phaseDrafts = services.buildPlanningPhaseArtifactDrafts(
                    {
                      issueId: input.item.issue_id,
                      attempt: input.item.attempt,
                      phase,
                    },
                  );
                  const contractArtifact = phaseDrafts[0]!;
                  const promptArtifact = phaseDrafts[1]!;
                  const phaseArtifacts =
                    services.buildPlanningSessionArtifactPaths({
                      repoPath: input.store.repo.path,
                      context: contextArtifact.path,
                      testPlan: testPlanArtifact.path,
                      contract: contractArtifact.path,
                      prompt: promptArtifact.path,
                    });
                  const phaseOutputPath = services.buildPlanningPhaseOutputPath(
                    {
                      contextPath,
                      phase,
                    },
                  );

                  services
                    .persistPlanningArtifacts(
                      phaseDrafts,
                      input.artifactWriter,
                      input.store.repo.path,
                    )
                    .pipe(
                      chain(() =>
                        input.planningSessionRunner({
                          phase,
                          repo: input.store.repo,
                          issueId: input.item.issue_id,
                          attempt: input.item.attempt,
                          runId: input.runId,
                          executionId: input.executionId,
                          artifactPaths: phaseArtifacts,
                        }),
                      ),
                    )
                    .pipe(
                      fork(phaseReject)((planningSessionResult) => {
                        const startedEvent =
                          services.createPlanningSessionStartedEvent({
                            issueId: input.item.issue_id,
                            runId: input.runId,
                            executionId: input.executionId,
                            command: planningSessionResult.command,
                            args: planningSessionResult.args,
                            artifactPaths: phaseArtifacts,
                            occurredAt: planningSessionResult.started_at,
                          });
                        const outputEvents = [
                          planningSessionResult.stdout.length > 0
                            ? services.createPlanningSessionOutputEvent({
                                issueId: input.item.issue_id,
                                runId: input.runId,
                                executionId: input.executionId,
                                stream: "stdout",
                                output: planningSessionResult.stdout,
                                occurredAt: planningSessionResult.finished_at,
                              })
                            : null,
                          planningSessionResult.stderr.length > 0
                            ? services.createPlanningSessionOutputEvent({
                                issueId: input.item.issue_id,
                                runId: input.runId,
                                executionId: input.executionId,
                                stream: "stderr",
                                output: planningSessionResult.stderr,
                                occurredAt: planningSessionResult.finished_at,
                              })
                            : null,
                        ].filter(
                          (event): event is DomainEvent => event !== null,
                        );
                        const finishedEvent =
                          services.createPlanningSessionFinishedEvent({
                            issueId: input.item.issue_id,
                            runId: input.runId,
                            executionId: input.executionId,
                            result: planningSessionResult,
                          });

                        events.push(
                          startedEvent,
                          ...outputEvents,
                          finishedEvent,
                        );

                        if (
                          planningSessionResult.exit_code !== 0 ||
                          planningSessionResult.signal !== null
                        ) {
                          phaseResolve({
                            artifacts,
                            events,
                            finalSessionResult: planningSessionResult,
                            planningRunPlanValid: false,
                            planningRunPlanReady: false,
                            failure: {
                              state: "failed",
                              code: "AUTOBOT-PLANNER-SESSION-FAILED",
                              message: `planning session exited with code ${String(
                                planningSessionResult.exit_code,
                              )}`,
                              occurred_at: planningSessionResult.finished_at,
                            },
                          });
                          return;
                        }

                        if (phaseOutputPath === null) {
                          runPhase(index + 1);
                          return;
                        }

                        services
                          .readPlanningRunPlanArtifact({
                            path: phaseOutputPath,
                            reader: input.artifactReader,
                          })
                          .pipe(
                            fork(phaseReject)((outputRead) => {
                              const assessment =
                                outputRead.content !== null
                                  ? services.assessPlanningRunPlanContent(
                                      outputRead.content,
                                    )
                                  : {
                                      errors: ["missing run-plan.md"],
                                      readiness: null,
                                    };

                              if (
                                outputRead.error !== null ||
                                outputRead.content === null ||
                                assessment.errors.length > 0 ||
                                assessment.readiness === null ||
                                assessment.readiness !== "ready_to_proceed"
                              ) {
                                phaseResolve({
                                  artifacts,
                                  events,
                                  finalSessionResult: planningSessionResult,
                                  planningRunPlanValid: false,
                                  planningRunPlanReady: false,
                                  failure: {
                                    state:
                                      assessment.readiness === "not_ready" ||
                                      assessment.readiness === "needs_research"
                                        ? "awaiting"
                                        : "failed",
                                    code:
                                      outputRead.error !== null
                                        ? "AUTOBOT-PLANNER-RUN-PLAN-READ-FAILED"
                                        : assessment.errors.length > 0
                                        ? "AUTOBOT-PLANNER-RUN-PLAN-INVALID"
                                        : "AUTOBOT-PLANNER-RUN-PLAN-NOT-READY",
                                    message:
                                      outputRead.error !== null
                                        ? `planning session could not read run-plan.md: ${String(
                                            outputRead.error,
                                          )}`
                                        : assessment.errors.length > 0
                                        ? `planning session produced invalid run-plan.md: ${assessment.errors.join(
                                            ", ",
                                          )}`
                                        : "planning session produced a non-ready run-plan.md; route to research-refine before implementation",
                                    occurred_at:
                                      planningSessionResult.finished_at,
                                  },
                                });
                                return;
                              }

                              const runPlanArtifact =
                                services.buildPlanningPhaseOutputArtifact({
                                  phase,
                                  path: phaseOutputPath,
                                  content: outputRead.content,
                                });
                              if (runPlanArtifact !== null) {
                                artifacts.push(runPlanArtifact);
                                events.push(
                                  services.createPlanningArtifactCreatedEvent({
                                    issueId: input.item.issue_id,
                                    runId: input.runId,
                                    executionId: input.executionId,
                                    artifact: runPlanArtifact,
                                    occurredAt:
                                      planningSessionResult.finished_at,
                                  }),
                                );
                              }

                              phaseResolve({
                                artifacts,
                                events,
                                finalSessionResult: planningSessionResult,
                                planningRunPlanValid: true,
                                planningRunPlanReady: true,
                                failure: null,
                              });
                            }),
                          );
                      }),
                    );
                };

                runPhase(0);

                return () => undefined;
              }),
            ),
          ) as FutureInstance<unknown, PlanningPhaseSequenceResult>;

        sequence.pipe(
          fork(reject as (reason: unknown) => void)(
            resolveFuture as (value: PlanningPhaseSequenceResult) => void,
          ),
        );
      })
      .catch(reject);

    return () => undefined;
  });
}

export function createNoopPlanningSessionRunner(): PlanningSessionRunner {
  return (input) =>
    resolve(
      buildPlanningSessionResult(
        buildOpenCodePlanningCommand(input),
        new Date().toISOString(),
        new Date().toISOString(),
        0,
        null,
        "",
        "",
      ),
    );
}
