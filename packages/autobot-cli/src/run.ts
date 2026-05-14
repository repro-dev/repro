import type { RepoRef } from "@repro/autobot-core";
import { Future, fork, type FutureInstance } from "fluture";

import {
  AutobotCliError,
  autobotExitCodes,
  createUsageError,
  toErrorPayload,
} from "./errors";
import {
  renderAutobotError,
  renderAutobotItemDetail,
  renderAutobotItemSummary,
} from "./render/human";
import {
  renderJsonErrorEnvelope,
  renderJsonSuccessEnvelope,
} from "./render/json";
import { createAutobotProgram } from "./program";
import { createAutobotServices, type AutobotServices } from "./services";
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
} from "./types";

export interface AutobotCliIO {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  isTTY?: boolean;
}

function buildRepoRef(options: AutobotGlobalOptions): RepoRef | undefined {
  if (options.repo === null) {
    return undefined;
  }

  return {
    path: options.repo,
    state_dir: options.state_dir ?? ".autobot",
  };
}

function buildCommand(commandPath: readonly string[]): string {
  return ["autobot-next", ...commandPath].join(" ");
}

function extractCanonicalCommandPath(
  args: readonly string[],
  program = createAutobotProgram(),
): string[] {
  const path: string[] = [];
  let current = program;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;

    if (token.startsWith("-")) {
      if (
        token === "--repo" ||
        token === "--state-dir" ||
        token === "--profile"
      ) {
        index += 1;
      }

      continue;
    }

    const next = current.commands.find((command) => command.name() === token);

    if (next === undefined) {
      break;
    }

    path.push(token);
    current = next;
  }

  return path;
}

function renderSuccess(
  result: AutobotCommandResult,
  json: boolean,
  io: AutobotCliIO,
): void {
  if (json) {
    io.stdout.write(
      renderJsonSuccessEnvelope({
        command: result.command,
        repo: result.repo,
        data: result.data,
        warnings: result.warnings,
      }),
    );
    return;
  }

  switch (result.kind) {
    case "item-detail":
      io.stdout.write(
        `${renderAutobotItemDetail(result.data, {
          color: io.isTTY === true,
        })}\n`,
      );
      return;
    case "item-summary":
      io.stdout.write(
        `${renderAutobotItemSummary(result.data, {
          color: io.isTTY === true,
        })}\n`,
      );
      return;
  }
}

export function runAutobotCli(
  argv: string[] = process.argv,
  io: AutobotCliIO = process,
  services: AutobotServices = createAutobotServices(),
): FutureInstance<unknown, number> {
  return Future((reject, resolve) => {
    void reject;
    let invocation: AutobotInvocation | null = null;
    const args = argv.slice(2);
    const program = createAutobotProgram({
      onInvocation(nextInvocation) {
        invocation = nextInvocation;
      },
    });

    program.exitOverride();
    program.configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
      outputError: () => undefined,
    });

    try {
      program.parse(args, { from: "user" });
    } catch (error) {
      const commandPath = extractCanonicalCommandPath(args);
      const command = buildCommand(commandPath);
      const usageError = createUsageError({
        command,
        message:
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Invalid command usage",
      });

      if (argv.includes("--json")) {
        io.stdout.write(
          renderJsonErrorEnvelope({
            command,
            error: usageError.toErrorPayload(),
          }),
        );
      } else {
        io.stderr.write(`${renderAutobotError(usageError.toErrorPayload())}\n`);
      }

      resolve(usageError.exit_code);
      return () => undefined;
    }

    if (invocation === null) {
      resolve(autobotExitCodes.ok);
      return () => undefined;
    }

    const parsedInvocation = invocation as AutobotInvocation;

    try {
      return services.handleInvocation(parsedInvocation).pipe(
        fork((error) => {
          const payload = toErrorPayload(error);
          const command = buildCommand(parsedInvocation.command_path);

          if (parsedInvocation.options.json) {
            io.stdout.write(
              renderJsonErrorEnvelope({
                command,
                repo: buildRepoRef(parsedInvocation.options),
                error: payload,
              }),
            );
          } else {
            io.stderr.write(
              `${renderAutobotError(payload, {
                color: parsedInvocation.options.color && io.isTTY === true,
              })}\n`,
            );
          }

          resolve(
            error instanceof AutobotCliError
              ? error.exit_code
              : autobotExitCodes.failure,
          );
        })((result) => {
          renderSuccess(result, parsedInvocation.options.json, io);
          resolve(autobotExitCodes.ok);
        }),
      );
    } catch (error) {
      const payload = toErrorPayload(error);
      const command = buildCommand(parsedInvocation.command_path);

      if (parsedInvocation.options.json) {
        io.stdout.write(
          renderJsonErrorEnvelope({
            command,
            repo: buildRepoRef(parsedInvocation.options),
            error: payload,
          }),
        );
      } else {
        io.stderr.write(
          `${renderAutobotError(payload, {
            color: parsedInvocation.options.color && io.isTTY === true,
          })}\n`,
        );
      }

      resolve(
        error instanceof AutobotCliError
          ? error.exit_code
          : autobotExitCodes.failure,
      );
      return () => undefined;
    }
  });
}

export function main(argv: string[] = process.argv): void {
  runAutobotCli(argv).pipe(
    fork(() => {
      process.exitCode = autobotExitCodes.failure;
    })((exitCode) => {
      process.exitCode = exitCode;
    }),
  );
}
