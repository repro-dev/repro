import type { ErrorPayload } from "@repro/autobot-core";

export const autobotExitCodes = {
  ok: 0,
  usage: 2,
  failure: 1,
} as const;

export class AutobotCliError extends Error {
  readonly code: string;
  readonly what_failed: string;
  readonly likely_cause: string;
  readonly recovery_commands: string[];
  readonly details: Record<string, unknown> | null;
  readonly exit_code: number;

  constructor(input: {
    code: string;
    message: string;
    what_failed: string;
    likely_cause: string;
    recovery_commands: string[];
    details?: Record<string, unknown> | null;
    exit_code?: number;
  }) {
    super(input.message);
    this.code = input.code;
    this.what_failed = input.what_failed;
    this.likely_cause = input.likely_cause;
    this.recovery_commands = [...input.recovery_commands];
    this.details = input.details ?? null;
    this.exit_code = input.exit_code ?? autobotExitCodes.failure;
  }

  toErrorPayload(): ErrorPayload {
    return {
      code: this.code,
      message: this.message,
      what_failed: this.what_failed,
      likely_cause: this.likely_cause,
      recovery_commands: [...this.recovery_commands],
      details: this.details,
    };
  }
}

export function createUsageError(input: {
  command: string;
  message?: string;
  what_failed?: string;
  likely_cause?: string;
  recovery_commands?: string[];
  details?: Record<string, unknown> | null;
}): AutobotCliError {
  return new AutobotCliError({
    code: "AUTOBOT-USAGE-ERROR",
    message: input.message ?? "Invalid command usage",
    what_failed: input.what_failed ?? "command parsing",
    likely_cause:
      input.likely_cause ?? "the command usage did not match the parser tree",
    recovery_commands: input.recovery_commands ?? [`${input.command} --help`],
    details: input.details ?? null,
    exit_code: autobotExitCodes.usage,
  });
}

export function createNotImplementedError(command: string): AutobotCliError {
  return new AutobotCliError({
    code: "AUTOBOT-SERVICE-NOT-IMPLEMENTED",
    message: `Autobot service is not implemented for ${command}`,
    what_failed: `${command} execution`,
    likely_cause: "the greenfield service layer has not been wired yet",
    recovery_commands: ["autobot-next --help"],
    details: null,
    exit_code: autobotExitCodes.failure,
  });
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof AutobotCliError) {
    return error.toErrorPayload();
  }

  if (
    error !== null &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string" &&
    typeof (error as { what_failed?: unknown }).what_failed === "string" &&
    typeof (error as { likely_cause?: unknown }).likely_cause === "string" &&
    Array.isArray((error as { recovery_commands?: unknown }).recovery_commands)
  ) {
    const payload = error as ErrorPayload;

    return {
      code: payload.code,
      message: payload.message,
      what_failed: payload.what_failed,
      likely_cause: payload.likely_cause,
      recovery_commands: [...payload.recovery_commands],
      details: payload.details ?? null,
    };
  }

  return {
    code: "AUTOBOT-UNEXPECTED-ERROR",
    message: "Unexpected Autobot CLI error",
    what_failed: "CLI execution",
    likely_cause: "an unhandled error escaped the command handler",
    recovery_commands: ["autobot-next --help"],
    details: null,
  };
}
