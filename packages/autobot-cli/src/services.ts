import { createNotImplementedError } from "./errors";
import type { AutobotInvocation } from "./types";

export interface AutobotServices {
  handleInvocation(invocation: AutobotInvocation): unknown;
}

export function createAutobotServices(): AutobotServices {
  return {
    handleInvocation(invocation: AutobotInvocation) {
      throw createNotImplementedError(invocation.command);
    },
  };
}
