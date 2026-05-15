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
    color: options.color !== false && options.noColor !== true,
    dry_run: options.dryRun === true,
    force: options.force === true,
    project: Array.isArray(options.project)
      ? options.project.filter((project) => typeof project === "string")
      : [],
    labels: Array.isArray(options.labels)
      ? options.labels.filter((label) => typeof label === "string")
      : Array.isArray(options.label)
      ? options.label.filter((label) => typeof label === "string")
      : [],
    priority: typeof options.priority === "string" ? options.priority : null,
    limit:
      typeof options.limit === "number" && Number.isFinite(options.limit)
        ? options.limit
        : null,
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
    args: args
      .filter(
        (arg): arg is string | number | boolean =>
          typeof arg === "string" ||
          typeof arg === "number" ||
          typeof arg === "boolean",
      )
      .map((arg) => String(arg)),
    options: readGlobalOptions(command),
  };
}

function registerLeafCommand(
  program: Command,
  spec: {
    command: string;
    description: string;
    options?: string[];
  },
  onInvocation?: (invocation: AutobotInvocation) => void,
): void {
  const command = program.command(spec.command).description(spec.description);

  for (const option of spec.options ?? []) {
    command.option(option);
  }

  command.action(function (...values: unknown[]) {
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
    children: Array<{
      command: string;
      description: string;
      options?: string[];
    }>;
  },
  onInvocation?: (invocation: AutobotInvocation) => void,
): void {
  const group = program.command(spec.command).description(spec.description);

  for (const child of spec.children) {
    const childCommand = group
      .command(child.command)
      .description(child.description);

    for (const option of child.options ?? []) {
      childCommand.option(option);
    }

    childCommand.action(function (...values: unknown[]) {
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
    .option("-q, --quiet", "reduce output verbosity")
    .option("--verbose", "increase output verbosity")
    .option("--no-color", "disable ANSI color output")
    .showHelpAfterError("(use --help to inspect the current parser tree)");

  registerLeafCommand(
    program,
    {
      command: "add <issue-id>",
      description: "add an issue to the queue",
      options: ["--dry-run"],
    },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    {
      command: "remove <issue-id>",
      description: "remove an issue from the queue",
      options: ["--dry-run", "-f, --force"],
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
    { command: "status [issue-id]", description: "show issue status" },
    options.onInvocation,
  );
  registerLeafCommand(
    program,
    { command: "logs <issue-id>", description: "show issue logs" },
    options.onInvocation,
  );
  const discoverCommand = program
    .command("discover [query]")
    .description("discover matching work items")
    .option(
      "--project <name>",
      "filter by Linear project (repeatable)",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .option(
      "--label <name>",
      "filter by Linear label",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--priority <level>", "filter by priority")
    .option(
      "--limit <count>",
      "limit the number of discovered candidates",
      (value: string) => Number(value),
    );

  discoverCommand.action(function (...values: unknown[]) {
    const command = values[values.length - 1];
    if (!(command instanceof Command)) {
      return;
    }

    options.onInvocation?.(createInvocation(command, values.slice(0, -1)));
  });
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
      command: "inspect <run-id|flowcraft-execution-id>",
      description: "inspect a flowcraft execution",
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
          options: ["--dry-run"],
        },
        {
          command: "unset <key>",
          description: "unset a configuration value",
          options: ["--dry-run"],
        },
      ],
    },
    options.onInvocation,
  );

  const engineCommand = program
    .command("engine")
    .description("manage the engine");

  registerLeafCommand(
    engineCommand,
    { command: "status", description: "show engine status" },
    options.onInvocation,
  );
  registerLeafCommand(
    engineCommand,
    { command: "run-once", description: "run the engine once" },
    options.onInvocation,
  );
  registerLeafCommand(
    engineCommand,
    { command: "start", description: "start the engine" },
    options.onInvocation,
  );
  registerLeafCommand(
    engineCommand,
    { command: "stop", description: "stop the engine" },
    options.onInvocation,
  );

  const engineDebugCommand = engineCommand
    .command("debug")
    .description("engine debug helpers");
  const workflowCommand = engineDebugCommand
    .command("workflow")
    .description("inspect workflow helpers");

  registerLeafCommand(
    workflowCommand,
    { command: "list", description: "list available workflows" },
    options.onInvocation,
  );
  registerLeafCommand(
    workflowCommand,
    { command: "validate", description: "validate workflow definitions" },
    options.onInvocation,
  );
  registerLeafCommand(
    workflowCommand,
    { command: "diagram", description: "render a workflow diagram" },
    options.onInvocation,
  );

  return program;
}
