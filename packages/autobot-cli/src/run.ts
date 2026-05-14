import type { RepoRef } from "@repro/autobot-core";

import {
  AutobotCliError,
  autobotExitCodes,
  createUsageError,
  toErrorPayload,
} from "./errors";
import { renderAutobotError } from "./render/human";
import { renderJsonErrorEnvelope } from "./render/json";
import { createAutobotProgram } from "./program";
import { createAutobotServices, type AutobotServices } from "./services";
import type { AutobotGlobalOptions, AutobotInvocation } from "./types";

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

function inferCommand(argv: string[]): string {
  return argv.join(" ") || "autobot-next";
}

export function runAutobotCli(
  argv: string[] = process.argv,
  io: AutobotCliIO = process,
  services: AutobotServices = createAutobotServices(),
): number {
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
    const command = inferCommand(args);
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

    return usageError.exit_code;
  }

  if (invocation === null) {
    return autobotExitCodes.ok;
  }

  const parsedInvocation = invocation as AutobotInvocation;

  try {
    services.handleInvocation(parsedInvocation);
    return autobotExitCodes.ok;
  } catch (error) {
    const payload = toErrorPayload(error);

    if (parsedInvocation.options.json) {
      io.stdout.write(
        renderJsonErrorEnvelope({
          command: inferCommand(args),
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

    return error instanceof AutobotCliError
      ? error.exit_code
      : autobotExitCodes.failure;
  }
}

export function main(argv: string[] = process.argv): void {
  const exitCode = runAutobotCli(argv);
  process.exitCode = exitCode;
}
