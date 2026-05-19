import { spawn } from "node:child_process";

import { Future, resolve, type FutureInstance } from "fluture";

import type { RepoRef } from "@repro/autobot-core";

import type { SingleTrackPhaseContractName } from "./phase-contracts";
import { renderSingleTrackPhaseContract } from "./phase-contracts";

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
      "--file",
      input.artifactPaths.context,
      "--file",
      input.artifactPaths.testPlan,
      "--file",
      input.artifactPaths.contract,
      "--file",
      input.artifactPaths.prompt,
      buildPlanningSessionPrompt(input),
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
