import { createNotImplementedError } from "./errors";
import type { AutobotCommandResult, AutobotInvocation } from "./types";

export interface AutobotServices {
  handleInvocation(invocation: AutobotInvocation): AutobotCommandResult;
}

export function createAutobotServices(): AutobotServices {
  return {
    handleInvocation(invocation: AutobotInvocation) {
      throw createNotImplementedError(invocation.command);
    },
  };
}
