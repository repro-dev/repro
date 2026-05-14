import { Command } from "commander";

import type {
  AutobotGlobalOptions,
  AutobotInvocation,
  AutobotProgramOptions,
} from "./types";

function readGlobalOptions(command: Command): AutobotGlobalOptions {
  const options = command.optsWithGlobals() as Record<string, unknown>;

  return {
    json: options.json === true,
    repo: typeof options.repo === "string" ? options.repo : null,
    state_dir: typeof options.stateDir === "string" ? options.stateDir : null,
    profile: typeof options.profile === "string" ? options.profile : null,
    quiet: options.quiet === true,
    verbose: options.verbose === true,
    color: options.noColor !== true,
  };
}

function commandPath(command: Command): string[] {
  const path: string[] = [];
  for (
    let current: Command | null = command;
    current !== null;
    current = current.parent ?? null
  ) {
    const name = current.name();
    if (name.length > 0) {
      path.unshift(name);
    }
  }

  return path;
}

function createInvocation(
  command: Command,
  args: unknown[],
): AutobotInvocation {
  const path = commandPath(command);
  const commandSegments = path.slice(1);

  return {
    command_path: commandSegments,
    command: commandSegments.join(" "),
    args: args.map((arg) => String(arg)),
    options: readGlobalOptions(command),
  };
}

function registerLeafCommand(
  program: Command,
  spec: {
    command: string;
    description: string;
  },
  onInvocation?: (invocation: AutobotInvocation) => void,
): void {
  program
    .command(spec.command)
    .description(spec.description)
    .action(function (...values: unknown[]) {
      const command = values[values.length - 1];
      if (!(command instanceof Command)) {
        return;
      }

      onInvocation?.(createInvocation(command, values.slice(0, -1)));
    });
}

function registerGroupCommand(
  program: Command,
  spec: {
    command: string;
    description: string;
    children: Array<{ command: string; description: string }>;
  },
  onInvocation?: (invocation: AutobotInvocation) => void,
): void {
  const group = program.command(spec.command).description(spec.description);

  for (const child of spec.children) {
    group
      .command(child.command)
      .description(child.description)
      .action(function (...values: unknown[]) {
        const command = values[values.length - 1];
        if (!(command instanceof Command)) {
          return;
        }

        onInvocation?.(createInvocation(command, values.slice(0, -1)));
      });
  }
}

export function createAutobotProgram(
  options: AutobotProgramOptions = {},
): Command {
  const program = new Command();

  program
    .name("autobot-next")
    .description("Greenfield Autobot CLI shell")
    .option("--json", "emit JSON envelopes")
    .option("--repo <path>", "repository root path")
    .option("--state-dir <path>", "override the state directory")
    .option("--profile <name>", "select a profile")
    .option("--quiet", "reduce output verbosity")
    .option("--verbose", "increase output verbosity")
    .option("--no-color", "disable ANSI color output")
    .showHelpAfterError("(use --help to inspect the current parser tree)");

  registerLeafCommand(
    program,
    { command: "add <issue-id>", description: "add an issue to the queue" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    {
      command: "remove <issue-id>",
      description: "remove an issue from the queue",
    },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    { command: "list", description: "list queued issues" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    { command: "status <issue-id>", description: "show issue status" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    { command: "logs <issue-id>", description: "show issue logs" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    {
      command: "discover [query]",
      description: "discover matching work items",
    },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    { command: "retry <issue-id>", description: "retry the current run" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    { command: "cancel <issue-id>", description: "cancel the current run" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    {
      command: "reconcile <issue-id>",
      description: "reconcile local and remote state",
    },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    {
      command: "inspect <issue-id>",
      description: "inspect the execution history",
    },
    options.onInvocation,
  );

  registerGroupCommand(
    program,
    {
      command: "config",
      description: "configure Autobot settings",
      children: [
        { command: "list", description: "list configuration entries" },
        { command: "get <key>", description: "read a configuration value" },
        {
          command: "set <key> <value>",
          description: "set a configuration value",
        },
        { command: "unset <key>", description: "unset a configuration value" },
      ],
    },
    options.onInvocation,
  );

  registerGroupCommand(
    program,
    {
      command: "engine",
      description: "manage the engine",
      children: [
        { command: "status", description: "show engine status" },
        { command: "run-once", description: "run the engine once" },
        { command: "start", description: "start the engine" },
        { command: "stop", description: "stop the engine" },
      ],
    },
    options.onInvocation,
  );

  registerGroupCommand(
    program,
    {
      command: "workflow",
      description: "inspect workflow helpers",
      children: [
        { command: "list", description: "list available workflows" },
        { command: "validate", description: "validate workflow definitions" },
        { command: "diagram", description: "render a workflow diagram" },
      ],
    },
    options.onInvocation,
  );

  return program;
}
