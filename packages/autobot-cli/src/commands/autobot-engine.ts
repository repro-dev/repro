import fs from "node:fs";

import type { AutobotEngineStatus } from "../types";
import {
  engineModePath,
  loadEngineStatus,
  planCurrentQueue,
  shapeEngineStatus,
  startEngine,
  stopEngine,
} from "../runtime";

function parseFlags(args: string[]): {
  once: boolean;
  daemon: boolean;
  rest: string[];
} {
  const rest: string[] = [];
  let once = false;
  let daemon = false;
  for (const arg of args) {
    if (arg === "--once") {
      once = true;
      continue;
    }
    if (arg === "--daemon" || arg === "-d") {
      daemon = true;
      continue;
    }
    rest.push(arg);
  }
  return { once, daemon, rest };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function statusOrFallback(): AutobotEngineStatus {
  return (
    loadEngineStatus() ??
    shapeEngineStatus(
      fs.existsSync(engineModePath())
        ? (fs.readFileSync(engineModePath(), "utf8").trim() as
            | "foreground"
            | "daemon")
        : "foreground",
    )
  );
}

export function runAutobotEngine(argv: string[]): void {
  const subcmd = argv[2] ?? "";
  const { once, daemon, rest } = parseFlags(argv.slice(3));

  switch (subcmd) {
    case "help":
    case "--help":
    case "-h":
    case "":
      process.stdout.write(
        [
          "Usage: autobot-engine <command>",
          "",
          "Commands:",
          "  start [--daemon|-d] [--once]   Start the engine in foreground or daemon mode",
          "  restart [--daemon|-d]          Restart the engine, preserving daemon mode",
          "  stop                           Stop the running engine",
          "  status                         Show engine and queue status",
        ].join("\n") + "\n",
      );
      return;
    case "start": {
      const mode = daemon ? "daemon" : "foreground";
      const status = startEngine(mode, once);
      print(status);
      return;
    }
    case "stop": {
      const status = stopEngine();
      print(status);
      return;
    }
    case "restart": {
      const mode = daemon ? "daemon" : "foreground";
      stopEngine();
      print(startEngine(mode, once));
      return;
    }
    case "status": {
      print(statusOrFallback());
      return;
    }
    case "process-queue": {
      print(planCurrentQueue());
      return;
    }
    default:
      if (rest.length === 0 && subcmd === "_daemon") {
        print(startEngine("foreground", true));
        return;
      }
      throw new Error(`Unknown autobot-engine command: ${subcmd}`);
  }
}
