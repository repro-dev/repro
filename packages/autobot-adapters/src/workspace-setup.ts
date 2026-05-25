import { execFile } from "node:child_process";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { Future, fork, type FutureInstance } from "fluture";

export type WorkspaceSetupStepName =
  | "run-directories"
  | "bootstrap-config"
  | "dependencies"
  | "build"
  | "direnv"
  | "validation";

export interface WorkspaceSetupStepResult {
  name: WorkspaceSetupStepName;
  status: "succeeded" | "skipped" | "failed";
  started_at: string;
  finished_at: string;
  command?: string;
  args?: string[];
  stdout_log_path?: string;
  stderr_log_path?: string;
  skip_reason?: string;
}

export interface WorkspaceSetupResult {
  issue_id: string;
  run_id: string;
  attempt: number;
  workspace_path: string;
  status: "succeeded";
  started_at: string;
  finished_at: string;
  steps: WorkspaceSetupStepResult[];
  summary_artifact_path: string;
}

export interface WorkspaceSetupProgressRecord {
  event:
    | "started"
    | "step_started"
    | "step_succeeded"
    | "step_skipped"
    | "step_failed"
    | "succeeded"
    | "failed";
  step: WorkspaceSetupStepName | "workspace-setup";
  occurred_at: string;
  data?: Record<string, unknown>;
}

export interface WorkspaceSetupInput {
  repoRoot: string;
  workspacePath: string;
  issueId: string;
  runId: string;
  attempt: number;
}

interface RunCommandInput {
  cwd: string;
  command: string;
  args: string[];
}

interface RunCommandOutput {
  stdout: string;
  stderr: string;
}

interface WorkspaceSetupDependencies {
  runCommand?: (
    input: RunCommandInput,
  ) => FutureInstance<unknown, RunCommandOutput>;
  mkdir?: (path: string) => FutureInstance<unknown, void>;
  copyFile?: (
    source: string,
    destination: string,
  ) => FutureInstance<unknown, void>;
  writeFile?: (path: string, content: string) => FutureInstance<unknown, void>;
  pathExists?: (path: string) => FutureInstance<unknown, boolean>;
  isMainDirenvTrusted?: (repoRoot: string) => FutureInstance<unknown, boolean>;
  now?: () => string;
  onProgress?: (record: WorkspaceSetupProgressRecord) => void;
}

const execFileAsync = promisify(execFile);

function defaultRunCommand(
  input: RunCommandInput,
): FutureInstance<unknown, RunCommandOutput> {
  return Future((reject, resolve) => {
    void execFileAsync(input.command, input.args, {
      cwd: input.cwd,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    }).then(
      (result) => resolve({ stdout: result.stdout, stderr: result.stderr }),
      reject,
    );

    return () => undefined;
  });
}

function futureFromPromise<T>(
  factory: () => Promise<T>,
): FutureInstance<unknown, T> {
  return Future((reject, resolve) => {
    void factory().then(resolve, reject);
    return () => undefined;
  });
}

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

function createSetupError(input: {
  step: WorkspaceSetupStepName;
  workspacePath: string;
  command?: string;
  args?: string[];
  stdoutLogPath?: string;
  stderrLogPath?: string;
  completedSteps: WorkspaceSetupStepResult[];
  skippedSteps: WorkspaceSetupStepResult[];
  cause: unknown;
}) {
  const cause = input.cause as { message?: unknown } | null;
  const message =
    typeof cause?.message === "string" ? cause.message : String(input.cause);
  const isBootstrap =
    input.step === "bootstrap-config" ||
    input.step === "dependencies" ||
    input.step === "build";
  const code = isBootstrap
    ? "AUTOBOT-WORKSPACE-BOOTSTRAP-FAILED"
    : input.step === "direnv"
    ? "AUTOBOT-WORKSPACE-DIRENV-FAILED"
    : "AUTOBOT-WORKSPACE-VALIDATION-FAILED";
  const worktreeName = path.basename(input.workspacePath);
  const recoveryCommands = isBootstrap
    ? [
        `cp .linear .autobot/worktrees/${worktreeName}/.linear`,
        `cp .envrc.local .autobot/worktrees/${worktreeName}/.envrc.local`,
        "pnpm install --frozen-lockfile",
        "moon run :build",
      ]
    : input.step === "direnv"
    ? ["direnv allow", "direnv status"]
    : [
        "node --version",
        "pnpm --version",
        "moon --version",
        "bin/linear --version",
        "opencode --version",
      ];

  return {
    code,
    message: `Workspace setup failed during ${input.step}`,
    what_failed: `workspace setup ${input.step}`,
    likely_cause: message,
    recovery_commands: recoveryCommands,
    details: {
      step: input.step,
      cwd: input.workspacePath,
      command: input.command,
      args: input.args ?? [],
      stdout_log_path: input.stdoutLogPath,
      stderr_log_path: input.stderrLogPath,
      workspace_path: input.workspacePath,
      completed_steps: input.completedSteps.map((step) => step.name),
      skipped_steps: input.skippedSteps.map((step) => step.name),
      error: message,
    },
  };
}

function commandOutputFromError(error: unknown): RunCommandOutput {
  const commandError = error as
    | { stdout?: unknown; stderr?: unknown }
    | null
    | undefined;
  return {
    stdout:
      typeof commandError?.stdout === "string"
        ? commandError.stdout
        : Buffer.isBuffer(commandError?.stdout)
        ? commandError.stdout.toString("utf8")
        : "",
    stderr:
      typeof commandError?.stderr === "string"
        ? commandError.stderr
        : Buffer.isBuffer(commandError?.stderr)
        ? commandError.stderr.toString("utf8")
        : "",
  };
}

function isDirenvStatusAllowed(stdout: string): boolean {
  const status = JSON.parse(stdout) as {
    state?: { foundRC?: { allowed?: unknown } };
  };
  return status.state?.foundRC?.allowed === 0;
}

export function setupAutobotWorkspace(
  input: WorkspaceSetupInput,
  dependencies: WorkspaceSetupDependencies = {},
): FutureInstance<unknown, WorkspaceSetupResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const makeDirectory: (target: string) => FutureInstance<unknown, void> =
    dependencies.mkdir ??
    ((target) =>
      futureFromPromise(async () => {
        await mkdir(target, { recursive: true });
      }));
  const copyFileDependency =
    dependencies.copyFile ??
    ((source, destination) =>
      futureFromPromise(() => copyFile(source, destination)));
  const writeFileDependency =
    dependencies.writeFile ??
    ((target, content) => futureFromPromise(() => writeFile(target, content)));
  const pathExists =
    dependencies.pathExists ??
    ((target) =>
      futureFromPromise(
        async () => (await stat(target).catch(() => null)) !== null,
      ));
  const isMainDirenvTrusted =
    dependencies.isMainDirenvTrusted ??
    (() =>
      futureFromPromise(async () => {
        return runFuture(
          runCommand({
            cwd: input.repoRoot,
            command: "direnv",
            args: ["status", "--json"],
          }),
        )
          .then((output) => isDirenvStatusAllowed(output.stdout))
          .catch(() => false);
      }));
  const attemptRoot = path.join(
    input.workspacePath,
    ".autobot",
    "runs",
    input.issueId,
    `attempt-${input.attempt}`,
  );
  const logsRoot = path.join(attemptRoot, "logs", "workspace-setup");
  const summaryArtifactPath = path.join(attemptRoot, "workspace-setup.json");

  return Future((reject, resolve) => {
    void (async () => {
      const startedAt = now();
      const steps: WorkspaceSetupStepResult[] = [];
      const emit = (record: WorkspaceSetupProgressRecord) =>
        dependencies.onProgress?.(record);
      const completedSteps = () =>
        steps.filter((step) => step.status === "succeeded");
      const skippedSteps = () =>
        steps.filter((step) => step.status === "skipped");
      const writeCommandLogs = async (
        stdoutLogPath: string,
        stderrLogPath: string,
        output: RunCommandOutput,
      ) => {
        await runFuture(writeFileDependency(stdoutLogPath, output.stdout));
        await runFuture(writeFileDependency(stderrLogPath, output.stderr));
      };
      const tryWriteCommandLogs = async (
        stdoutLogPath: string,
        stderrLogPath: string,
        output: RunCommandOutput,
      ) => {
        try {
          await writeCommandLogs(stdoutLogPath, stderrLogPath, output);
        } catch {
          // Preserve the structured command failure; log-write failures are secondary.
        }
      };
      const runStep = async (
        step: WorkspaceSetupStepName,
        command: string,
        args: string[],
      ) => {
        const stepStartedAt = now();
        const stdoutLogPath = path.join(logsRoot, `${step}.stdout.log`);
        const stderrLogPath = path.join(logsRoot, `${step}.stderr.log`);
        emit({
          event: "step_started",
          step,
          occurred_at: stepStartedAt,
          data: { command, args },
        });
        try {
          const output = await runFuture(
            runCommand({ cwd: input.workspacePath, command, args }),
          );
          await writeCommandLogs(stdoutLogPath, stderrLogPath, output);
          const result: WorkspaceSetupStepResult = {
            name: step,
            status: "succeeded",
            started_at: stepStartedAt,
            finished_at: now(),
            command,
            args,
            stdout_log_path: stdoutLogPath,
            stderr_log_path: stderrLogPath,
          };
          steps.push(result);
          emit({
            event: "step_succeeded",
            step,
            occurred_at: result.finished_at,
            data: result as unknown as Record<string, unknown>,
          });
        } catch (error) {
          const failedAt = now();
          await tryWriteCommandLogs(
            stdoutLogPath,
            stderrLogPath,
            commandOutputFromError(error),
          );
          const failure = createSetupError({
            step,
            workspacePath: input.workspacePath,
            command,
            args,
            stdoutLogPath,
            stderrLogPath,
            completedSteps: completedSteps(),
            skippedSteps: skippedSteps(),
            cause: error,
          });
          steps.push({
            name: step,
            status: "failed",
            started_at: stepStartedAt,
            finished_at: failedAt,
            command,
            args,
            stdout_log_path: stdoutLogPath,
            stderr_log_path: stderrLogPath,
          });
          emit({
            event: "step_failed",
            step,
            occurred_at: failedAt,
            data: failure,
          });
          throw failure;
        }
      };
      const runValidationStep = async () => {
        const stepStartedAt = now();
        const step = "validation";
        emit({ event: "step_started", step, occurred_at: stepStartedAt });
        let failedCommand: string | undefined;
        let failedArgs: string[] | undefined;
        let failedStdoutLogPath: string | undefined;
        let failedStderrLogPath: string | undefined;
        try {
          for (const [command, args] of [
            ["node", ["--version"]],
            ["pnpm", ["--version"]],
            ["moon", ["--version"]],
            [path.join(input.workspacePath, "bin", "linear"), ["--version"]],
            ["opencode", ["--version"]],
          ] as const) {
            const stdoutLogPath = path.join(
              logsRoot,
              `${step}-${path.basename(command)}.stdout.log`,
            );
            const stderrLogPath = path.join(
              logsRoot,
              `${step}-${path.basename(command)}.stderr.log`,
            );
            failedCommand = command;
            failedArgs = [...args];
            failedStdoutLogPath = stdoutLogPath;
            failedStderrLogPath = stderrLogPath;
            const output = await runFuture(
              runCommand({
                cwd: input.workspacePath,
                command,
                args: [...args],
              }),
            );
            await writeCommandLogs(stdoutLogPath, stderrLogPath, output);
          }
          markSucceeded(step, stepStartedAt);
        } catch (error) {
          const failedAt = now();
          if (failedStdoutLogPath && failedStderrLogPath) {
            await tryWriteCommandLogs(
              failedStdoutLogPath,
              failedStderrLogPath,
              commandOutputFromError(error),
            );
          }
          const failure = createSetupError({
            step,
            workspacePath: input.workspacePath,
            command: failedCommand,
            args: failedArgs,
            stdoutLogPath: failedStdoutLogPath,
            stderrLogPath: failedStderrLogPath,
            completedSteps: completedSteps(),
            skippedSteps: skippedSteps(),
            cause: error,
          });
          steps.push({
            name: step,
            status: "failed",
            started_at: stepStartedAt,
            finished_at: failedAt,
          });
          emit({
            event: "step_failed",
            step,
            occurred_at: failedAt,
            data: failure,
          });
          throw failure;
        }
      };
      const markSucceeded = (
        step: WorkspaceSetupStepName,
        started_at: string,
      ) => {
        const result: WorkspaceSetupStepResult = {
          name: step,
          status: "succeeded",
          started_at,
          finished_at: now(),
        };
        steps.push(result);
        emit({
          event: "step_succeeded",
          step,
          occurred_at: result.finished_at,
          data: result as unknown as Record<string, unknown>,
        });
      };
      const markSkipped = (
        step: WorkspaceSetupStepName,
        reason: string,
        started_at: string,
      ) => {
        const result: WorkspaceSetupStepResult = {
          name: step,
          status: "skipped",
          started_at,
          finished_at: now(),
          skip_reason: reason,
        };
        steps.push(result);
        emit({
          event: "step_skipped",
          step,
          occurred_at: result.finished_at,
          data: result as unknown as Record<string, unknown>,
        });
      };

      try {
        emit({
          event: "started",
          step: "workspace-setup",
          occurred_at: startedAt,
        });
        await runFuture(makeDirectory(path.join(attemptRoot, "artifacts")));
        await runFuture(makeDirectory(logsRoot));
        markSucceeded("run-directories", startedAt);

        const configStartedAt = now();
        emit({
          event: "step_started",
          step: "bootstrap-config",
          occurred_at: configStartedAt,
        });
        try {
          await runFuture(
            copyFileDependency(
              path.join(input.repoRoot, ".linear"),
              path.join(input.workspacePath, ".linear"),
            ),
          );
          if (
            await runFuture(
              pathExists(path.join(input.repoRoot, ".envrc.local")),
            )
          ) {
            await runFuture(
              copyFileDependency(
                path.join(input.repoRoot, ".envrc.local"),
                path.join(input.workspacePath, ".envrc.local"),
              ),
            );
          }
        } catch (error) {
          const failedAt = now();
          const failure = createSetupError({
            step: "bootstrap-config",
            workspacePath: input.workspacePath,
            completedSteps: completedSteps(),
            skippedSteps: skippedSteps(),
            cause: error,
          });
          steps.push({
            name: "bootstrap-config",
            status: "failed",
            started_at: configStartedAt,
            finished_at: failedAt,
          });
          emit({
            event: "step_failed",
            step: "bootstrap-config",
            occurred_at: failedAt,
            data: failure,
          });
          throw failure;
        }
        markSucceeded("bootstrap-config", configStartedAt);

        await runStep("dependencies", "pnpm", ["install", "--frozen-lockfile"]);
        await runStep("build", "moon", ["run", ":build"]);

        const direnvStartedAt = now();
        emit({
          event: "step_started",
          step: "direnv",
          occurred_at: direnvStartedAt,
        });
        const shouldRunDirenv =
          (await runFuture(
            pathExists(path.join(input.workspacePath, ".envrc")),
          )) && (await runFuture(isMainDirenvTrusted(input.repoRoot)));
        if (shouldRunDirenv) {
          await runStep("direnv", "direnv", ["allow"]);
        } else {
          markSkipped(
            "direnv",
            "direnv prerequisites not met",
            direnvStartedAt,
          );
        }

        await runValidationStep();

        const result: WorkspaceSetupResult = {
          issue_id: input.issueId,
          run_id: input.runId,
          attempt: input.attempt,
          workspace_path: input.workspacePath,
          status: "succeeded",
          started_at: startedAt,
          finished_at: now(),
          steps,
          summary_artifact_path: summaryArtifactPath,
        };
        await runFuture(
          writeFileDependency(
            summaryArtifactPath,
            JSON.stringify(result, null, 2),
          ),
        );
        emit({
          event: "succeeded",
          step: "workspace-setup",
          occurred_at: result.finished_at,
          data: result as unknown as Record<string, unknown>,
        });
        resolve(result);
      } catch (error) {
        emit({
          event: "failed",
          step: "workspace-setup",
          occurred_at: now(),
          data: error as Record<string, unknown>,
        });
        reject(error);
      }
    })();

    return () => undefined;
  });
}
