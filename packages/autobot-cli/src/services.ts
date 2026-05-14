import { reject, type FutureInstance } from "fluture";

import { createNotImplementedError } from "./errors";
import type { AutobotCommandResult, AutobotInvocation } from "./types";

export interface AutobotServices {
  handleInvocation(
    invocation: AutobotInvocation,
  ): FutureInstance<unknown, AutobotCommandResult>;
}

export function createAutobotServices(): AutobotServices {
  return {
    handleInvocation(invocation: AutobotInvocation) {
      return reject(createNotImplementedError(invocation.command));
    },
  };
}
