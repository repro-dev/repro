import { runAutobot } from "./commands/autobot";
import { runAutobotEngine } from "./commands/autobot-engine";

function stripGlobalFlags(argv: string[]): string[] {
  const args: string[] = [];
  for (const arg of argv.slice(2)) {
    switch (arg) {
      case "--json":
        process.env.REPROCTL_JSON = "true";
        continue;
      case "--quiet":
        process.env.REPROCTL_QUIET = "true";
        continue;
      case "--verbose":
        process.env.REPROCTL_DEBUG = "true";
        continue;
      default:
        args.push(arg);
    }
  }
  return args;
}

export function main(argv: string[]): void {
  const args = stripGlobalFlags(argv);
  const command = args[0] ?? "";
  if (command === "autobot") {
    runAutobot(["node", "autobot", ...args.slice(1)]);
    return;
  }
  if (command === "autobot-engine") {
    runAutobotEngine(["node", "autobot-engine", ...args.slice(1)]);
    return;
  }
  throw new Error(`Unknown autobot-cli command: ${command}`);
}

main(process.argv);
