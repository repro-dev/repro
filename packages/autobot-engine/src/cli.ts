import * as fs from "node:fs";

import {
  decideRecovery,
  processQueue,
  selectWork,
  trackedTasks,
  transition,
} from "./core";
import type { QueuePayload } from "./types";

function loadPayload(): QueuePayload {
  const raw = fs.readFileSync(0, "utf8");
  return JSON.parse(raw || "{}") as QueuePayload;
}

function main(argv: string[]): void {
  const command = argv[2] ?? "";
  const payload = loadPayload();

  switch (command) {
    case "select-work": {
      process.stdout.write(`${JSON.stringify(selectWork(payload))}\n`);
      return;
    }
    case "decide-recovery": {
      process.stdout.write(
        `${JSON.stringify(decideRecovery(payload as never))}\n`,
      );
      return;
    }
    case "transition": {
      const item = (payload.item ?? payload) as never;
      const observation = (payload.observation ?? payload) as never;
      process.stdout.write(
        `${JSON.stringify(transition(item, observation))}\n`,
      );
      return;
    }
    case "process-queue": {
      process.stdout.write(`${JSON.stringify(processQueue(payload))}\n`);
      return;
    }
    case "tracked-tasks": {
      process.stdout.write(`${JSON.stringify(trackedTasks(payload))}\n`);
      return;
    }
    default:
      throw new Error(`Unknown autobot-engine command: ${command}`);
  }
}

main(process.argv);
