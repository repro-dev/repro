import {
  discoverIssueIds,
  configPath,
  ensureQueueEntry,
  getConfigValue,
  listConfigItems,
  publicItem,
  queueForStatus,
  removeQueueEntry,
  loadConfigValues,
  shapeStatus,
  summarizeLogBundle,
  unsetConfigValue,
  setConfigValue,
} from "../runtime";

function parseJsonFlag(args: string[]): { json: boolean; rest: string[] } {
  const rest: string[] = [];
  let json = process.env.REPROCTL_JSON === "true";
  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    rest.push(arg);
  }
  return { json, rest };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printHuman(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function runAutobot(argv: string[]): void {
  const subcmd = argv[2] ?? "";
  const { json, rest } = parseJsonFlag(argv.slice(3));

  switch (subcmd) {
    case "help":
    case "--help":
    case "-h":
    case "":
      printHuman([
        "Usage: autobot <subcommand>",
        "",
        "Subcommands:",
        "  add <issue> [--json] [--dry-run]",
        "  remove <issue> [-f] [--json] [--dry-run]",
        "  list [--json]",
        "  status [<issue>] [--json]",
        "  logs [<issue>] [-t] [--json]",
        "  discover [--limit N] [--project NAME] [-q] [--json]",
        "  config get <key> [--json]",
        "  config set <key> <value> [--json]",
        "  config unset <key> [--json]",
        "  config list [--json]",
      ]);
      return;
    case "config": {
      const action = rest[0] ?? "";
      const key = rest[1] ?? "";
      const value = rest[2] ?? "";
      switch (action) {
        case "get": {
          const result = getConfigValue(key) as {
            value: unknown;
            source: string;
          };
          if (json) {
            print(result);
          } else {
            process.stdout.write(
              `${key} = ${result.value} (${result.source})\n`,
            );
          }
          return;
        }
        case "set":
          if (json) {
            print(setConfigValue(key, value));
          } else {
            process.stdout.write(`set ${key}\n`);
          }
          return;
        case "unset":
          if (json) {
            print(unsetConfigValue(key));
          } else {
            process.stdout.write(`unset ${key}\n`);
          }
          return;
        case "list":
          if (json) {
            print({
              schema_version: 1,
              config_path: configPath(),
              items: listConfigItems(),
            });
          } else {
            printHuman(
              listConfigItems().map(
                (item) =>
                  `- ${item.key} = ${item.value} (${item.source}) - ${item.description}`,
              ),
            );
          }
          return;
        default:
          throw new Error(`Unknown subcommand: ${action}`);
      }
    }
    case "add": {
      const issue = rest[0] ?? "";
      if (!issue) throw new Error("Missing issue identifier");
      if (rest.includes("--dry-run")) {
        if (json) {
          print({ issue_identifier: issue, dry_run: true, queued: false });
          return;
        }
        process.stdout.write(`Would queue item ${issue}\n`);
        return;
      }
      const item = ensureQueueEntry(issue);
      if (json) {
        print(publicItem(item));
        return;
      }
      process.stdout.write(`queued item ${issue}\n`);
      return;
    }
    case "remove": {
      const issue = rest.find((value) => !value.startsWith("-")) ?? "";
      if (!issue) throw new Error("Missing issue identifier");
      if (rest.includes("--dry-run")) {
        if (json) {
          print({ issue_identifier: issue, dry_run: true, removed: false });
        } else {
          process.stdout.write(`Would remove queued item ${issue}\n`);
        }
        return;
      }
      const item = removeQueueEntry(issue);
      if (!item) {
        if (json) {
          print({ removed: false, reason: "not queued" });
        } else {
          process.stdout.write(`not queued: ${issue}\n`);
        }
        return;
      }
      if (json) {
        print({ removed: true, issue_identifier: issue });
      } else {
        process.stdout.write(`removed queued item ${issue}\n`);
      }
      return;
    }
    case "list": {
      const status = shapeStatus(queueForStatus());
      if (json) {
        print(status);
      } else {
        printHuman([
          "QUEUE",
          `  total: ${status.summary.total}`,
          `  queued: ${status.summary.queued}`,
          `  running: ${status.summary.running}`,
          `  attention: ${status.summary.needs_attention}`,
          ...status.items.map((item) =>
            `  ${item.issue_identifier} ${item.state} ${item.workspace_path}`.trimEnd(),
          ),
        ]);
      }
      return;
    }
    case "status": {
      const issue = rest.find((value) => !value.startsWith("-"));
      const status = shapeStatus(queueForStatus(), issue);
      if (json) {
        print(status);
      } else {
        printHuman([
          "QUEUE",
          `  total: ${status.summary.total}`,
          `  queued: ${status.summary.queued}`,
          `  running: ${status.summary.running}`,
          `  attention: ${status.summary.needs_attention}`,
          ...status.items.map(
            (item) => `  ${item.issue_identifier} ${item.state}`,
          ),
        ]);
      }
      return;
    }
    case "logs": {
      if (json) {
        print(summarizeLogBundle());
      } else {
        process.stdout.write("no logs yet\n");
      }
      return;
    }
    case "discover": {
      const limitIndex = rest.indexOf("--limit");
      const limit =
        limitIndex >= 0
          ? Number.parseInt(rest[limitIndex + 1] ?? "10", 10)
          : 10;
      const ids = discoverIssueIds(queueForStatus()).slice(
        0,
        Number.isFinite(limit) ? limit : 10,
      );
      if (json) {
        print({
          schema_version: 1,
          config: {
            schema_version: 1,
            config_path: configPath(),
            values: loadConfigValues(),
          },
          items: ids.map((issue_identifier) => ({ issue_identifier })),
          generated_at: new Date().toISOString(),
        });
      } else {
        process.stdout.write(`${ids.join("\n")}\n`);
      }
      return;
    }
    default:
      throw new Error(`Unknown subcommand: ${subcmd}`);
  }
}
