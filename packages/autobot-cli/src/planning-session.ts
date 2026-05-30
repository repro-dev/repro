import { spawn } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";

import { Future, chain, fork, resolve, type FutureInstance } from "fluture";

import {
  checkCcSafetyNetPreflight,
  type AutobotPhaseAgentId,
} from "@repro/autobot-core";
import type {
  ArtifactKind,
  DomainEvent,
  ItemDetail,
  RepoRef,
} from "@repro/autobot-core";
import {
  createAutobotStore,
  type AutobotStore,
  type WorkerRecord,
} from "@repro/autobot-store";

import { AutobotCliError } from "./errors";
import {
  buildWorkerLogPaths,
  buildWorkerRunnerInvocation,
  type WorkerCommandInput,
} from "./worker-runner";

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

export type PlanningWorkerStarter = (
  input: PlanningSessionInput,
) => FutureInstance<unknown, void>;

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
  const phaseAgent = resolvePhaseAgentForContract(input.phase ?? "plan");

  return {
    command: "opencode",
    args: [
      "run",
      "--agent",
      phaseAgent,
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

export interface SafetyGuardPreflightResponse {
  ok: boolean;
  error?: AutobotCliError;
}

/**
 * Performs the cc-safety-net preflight check for an Autobot-managed OpenCode session.
 * Returns a result with `ok: true` if the plugin is active.
 * Returns `ok: false` with a structured error if the plugin is missing or the config is unavailable.
 * The caller should decide whether to throw, warn, or escalate based on the result.
 */
export function runPlanningSessionPreflight(input: {
  repoPath: string;
  issueId: string;
}): SafetyGuardPreflightResponse {
  const preflight = checkCcSafetyNetPreflight(input.repoPath);

  if (!preflight.ok) {
    return {
      ok: false,
      error: new AutobotCliError({
        code: "SAFETY_FORBIDDEN_COMMAND",
        message: "cc-safety-net is not active in OpenCode config",
        what_failed: "Autobot session safety preflight",
        likely_cause: `The OpenCode config at ${input.repoPath}/.opencode/opencode.json does not include cc-safety-net in its plugin list.`,
        recovery_commands: [
          "Add 'cc-safety-net' to the plugin array in .opencode/opencode.json",
          `autobot-next status ${input.issueId} --json`,
        ],
        details: {
          repo_path: input.repoPath,
          issue_id: input.issueId,
          preflight_message: preflight.message ?? null,
        },
        exit_code: 6,
      }),
    };
  }

  return { ok: true };
}

/** Maps single-track phase contract names to the their primary Autobot phase agent. */
function resolvePhaseAgentForContract(
  phase: SingleTrackPhaseContractName,
): AutobotPhaseAgentId {
  switch (phase) {
    case "prepare":
    case "classify":
    case "research-refine":
    case "plan":
    case "risk-assess":
      return "autobot-planner";
    case "develop":
      return "autobot-developer";
    case "test-verify":
      return "autobot-developer";
    case "review-standard":
    case "review-correctness-security":
    case "review-architecture-conventions":
    case "review-performance":
    case "review-ui-quality":
      return "autobot-reviewer";
    case "review-fix":
      return "autobot-review-fixer";
    case "reconcile":
    case "release-publish":
      return "autobot-publisher";
  }
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

function futureToPromise<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

function buildPlanningSessionWorkerRecord(
  input: PlanningSessionInput,
  command: PlanningSessionCommand,
  logPaths: ReturnType<typeof buildWorkerLogPaths>,
  startedAt: string,
  overrides: Partial<WorkerRecord> = {},
): WorkerRecord {
  return {
    worker_id: `worker-${input.runId}`,
    issue_id: input.issueId,
    run_id: input.runId,
    flowcraft_execution_id: input.executionId,
    workflow_node_id: input.phase ?? "plan",
    phase: input.phase ?? "plan",
    state: "starting",
    pid: null,
    child_pid: null,
    process_group_id: null,
    command: command.command,
    args: command.args,
    started_at: startedAt,
    last_heartbeat_at: null,
    deadline_at: null,
    stdout_log_path: logPaths.stdout_log_path,
    stderr_log_path: logPaths.stderr_log_path,
    spawn_error: null,
    result: null,
    result_artifact_path: null,
    exit_code: null,
    signal: null,
    finished_at: null,
    ...overrides,
  };
}

function buildPlanningSessionWorkerCommand(input: PlanningSessionInput): {
  command: PlanningSessionCommand;
  workerId: string;
  startedAt: string;
  logPaths: ReturnType<typeof buildWorkerLogPaths>;
  workerCommand: WorkerCommandInput;
} {
  const command = buildOpenCodePlanningCommand(input);
  const workerId = `worker-${input.runId}`;
  const startedAt = new Date().toISOString();
  const logPaths = buildWorkerLogPaths({
    repo: input.repo,
    worker_id: workerId,
  });

  return {
    command,
    workerId,
    startedAt,
    logPaths,
    workerCommand: {
      repo: input.repo,
      worker_id: workerId,
      issue_id: input.issueId,
      run_id: input.runId,
      execution_id: input.executionId,
      command: command.command,
      args: command.args,
      started_at: startedAt,
      stdout_log_path: logPaths.stdout_log_path,
      stderr_log_path: logPaths.stderr_log_path,
    },
  };
}

export function startOpenCodePlanningSessionWorker(
  input: PlanningSessionInput,
): FutureInstance<unknown, void> {
  return Future((reject, resolveFuture) => {
    const { command, startedAt, logPaths, workerCommand } =
      buildPlanningSessionWorkerCommand(input);
    let child: ReturnType<typeof spawn> | null = null;
    let settled = false;

    const recordFailure = async (error: unknown) => {
      await withPlanningSessionStore(input.repo, async (store) => {
        await futureToPromise(
          store.workers.upsert(
            buildPlanningSessionWorkerRecord(
              input,
              command,
              logPaths,
              startedAt,
              {
                state: "failed",
                pid: child?.pid ?? null,
                child_pid: child?.pid ?? null,
                process_group_id: child?.pid ?? null,
                last_heartbeat_at: startedAt,
                spawn_error: toPlanningSessionSpawnError(error, startedAt),
                finished_at: startedAt,
              },
            ),
          ),
        );
      });
    };

    void (async () => {
      try {
        await withPlanningSessionStore(input.repo, async (store) => {
          await futureToPromise(
            store.workers.upsert(
              buildPlanningSessionWorkerRecord(
                input,
                command,
                logPaths,
                startedAt,
              ),
            ),
          );
        });

        const invocation = buildWorkerRunnerInvocation(workerCommand);
        child = spawn(invocation.command, invocation.args, {
          cwd: input.repo.path,
          env: process.env,
          stdio: ["ignore", "ignore", "ignore"],
          detached: true,
        });

        child.once("error", (error) => {
          if (settled) {
            return;
          }

          settled = true;
          void recordFailure(error).then(() => reject(error), reject);
        });

        child.unref();

        await withPlanningSessionStore(input.repo, async (store) => {
          await futureToPromise(
            store.workers.upsert(
              buildPlanningSessionWorkerRecord(
                input,
                command,
                logPaths,
                startedAt,
                {
                  pid: child?.pid ?? null,
                  child_pid: child?.pid ?? null,
                  process_group_id: child?.pid ?? null,
                  last_heartbeat_at: startedAt,
                },
              ),
            ),
          );
        });

        if (!settled) {
          settled = true;
          resolveFuture(undefined);
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          await recordFailure(error).catch(() => undefined);
          reject(error);
        }
      }
    })();

    return () => undefined;
  });
}

function toPlanningSessionSpawnError(error: unknown, occurredAt: string) {
  return {
    code: "AUTOBOT-WORKER-SPAWN-FAILED",
    message:
      error instanceof Error && error.message.length > 0
        ? error.message
        : String(error),
    occurred_at: occurredAt,
  };
}

async function withPlanningSessionStore<T>(
  repo: RepoRef,
  handler: (store: AutobotStore) => Promise<T>,
): Promise<T> {
  const store = await futureToPromise(createAutobotStore({ repo }));

  try {
    return await handler(store);
  } finally {
    await futureToPromise(store.close());
  }
}

export function runOpenCodePlanningSession(
  input: PlanningSessionInput,
): FutureInstance<unknown, PlanningSessionResult> {
  const { command, workerId, startedAt, logPaths, workerCommand } =
    buildPlanningSessionWorkerCommand(input);

  return Future((reject, resolveFuture) => {
    let settled = false;
    let child: ReturnType<typeof spawn> | null = null;

    const readLog = async (filePath: string) => {
      try {
        return await readFile(filePath, "utf8");
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          code === "ENOENT"
        ) {
          return "";
        }

        throw error;
      }
    };

    const recordWrapperSpawnFailure = async (error: unknown) => {
      await withPlanningSessionStore(input.repo, async (store) => {
        await futureToPromise(
          store.workers.upsert(
            buildPlanningSessionWorkerRecord(
              input,
              command,
              logPaths,
              startedAt,
              {
                state: "failed",
                pid: child?.pid ?? null,
                last_heartbeat_at: startedAt,
                spawn_error: toPlanningSessionSpawnError(error, startedAt),
                finished_at: startedAt,
              },
            ),
          ),
        );
      });
    };

    const resolvePlanningSessionResult = async (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      const worker = await withPlanningSessionStore(
        input.repo,
        async (store) => {
          return await futureToPromise(store.workers.get(workerId));
        },
      );

      const [stdout, stderr] = await Promise.all([
        readLog(logPaths.stdout_path),
        readLog(logPaths.stderr_path),
      ]);
      const finishedAt = worker?.finished_at ?? new Date().toISOString();
      const workerSignal = (worker?.signal as NodeJS.Signals | null) ?? signal;

      resolveFuture(
        buildPlanningSessionResult(
          command,
          startedAt,
          finishedAt,
          worker?.exit_code ?? exitCode,
          workerSignal,
          stdout,
          stderr,
        ),
      );
    };

    void (async () => {
      try {
        const invocation = buildWorkerRunnerInvocation(workerCommand);
        child = spawn(invocation.command, invocation.args, {
          cwd: input.repo.path,
          env: process.env,
          stdio: ["ignore", "ignore", "ignore"],
        });

        child.once("error", (error) => {
          if (settled) {
            return;
          }

          settled = true;
          void (async () => {
            try {
              await recordWrapperSpawnFailure(error);
              reject(error);
            } catch (recordError) {
              reject(recordError);
            }
          })();
        });

        child.once("close", (exitCode, signal) => {
          if (settled) {
            return;
          }

          settled = true;
          void (async () => {
            try {
              await resolvePlanningSessionResult(exitCode, signal);
            } catch (error) {
              reject(error);
            }
          })();
        });
      } catch (error) {
        if (!settled) {
          settled = true;
          void (async () => {
            try {
              await recordWrapperSpawnFailure(error);
            } catch (recordError) {
              reject(recordError);
              return;
            }

            reject(error);
          })();
        }
      }
    })();

    return () => {
      if (settled) {
        return;
      }

      settled = true;
      child?.kill();
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
