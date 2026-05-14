import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { Future, fork, type FutureInstance } from "fluture";

export interface LinearDiscoverIssue {
  issue_id: string;
  title: string | null;
  url: string | null;
  project: string | null;
  labels: string[];
  priority: number | null;
  priority_label: string | null;
  status_name: string | null;
  state_type: string | null;
  assignee: string | null;
}

export interface LinearDiscoverInput {
  repoRoot: string;
  project: string;
}

interface RunCommandInput {
  cwd: string;
  command: string;
  args: string[];
}

interface DiscoverDependencies {
  runCommand?: (input: RunCommandInput) => FutureInstance<unknown, string>;
}

const execFileAsync = promisify(execFile);

function resolveLinearBinary(repoRoot: string): string {
  return path.join(repoRoot, "bin", "linear");
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }

    if (entry !== null && typeof entry === "object") {
      const label = (entry as { name?: unknown }).name;
      if (typeof label === "string" && label.trim().length > 0) {
        return [label.trim()];
      }
    }

    return [];
  });
}

function normalizeAssignee(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (value !== null && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") {
      return normalizeString(name);
    }
  }

  return null;
}

function normalizeStatusName(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (value !== null && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") {
      return normalizeString(name);
    }
  }

  return null;
}

function normalizeStateType(value: unknown): string | null {
  if (value !== null && typeof value === "object") {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string") {
      return normalizeString(type);
    }
  }

  return null;
}

function normalizeProject(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (value !== null && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") {
      return normalizeString(name);
    }
  }

  return null;
}

function normalizePriority(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeIssue(value: unknown): LinearDiscoverIssue | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const issue = value as Record<string, unknown>;
  const issue_id = normalizeString(issue.identifier ?? issue.issue_id);
  if (issue_id === null) {
    return null;
  }

  return {
    issue_id,
    title: normalizeString(issue.title),
    url: normalizeString(issue.url),
    project: normalizeProject(issue.project),
    labels: normalizeLabels(issue.labels),
    priority: normalizePriority(issue.priority),
    priority_label: normalizeString(issue.priorityLabel),
    status_name: normalizeStatusName(issue.status),
    state_type: normalizeStateType(issue.status),
    assignee: normalizeAssignee(issue.assignee),
  };
}

function parseLinearDiscoverPayload(payload: string): LinearDiscoverIssue[] {
  const parsed = JSON.parse(payload) as unknown;
  const items = Array.isArray(parsed)
    ? parsed
    : parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { items?: unknown }).items)
    ? (parsed as { items: unknown[] }).items
    : null;

  if (items === null) {
    throw new Error("Unexpected Linear issue list payload shape");
  }

  return items.flatMap((item) => {
    const normalized = normalizeIssue(item);
    return normalized === null ? [] : [normalized];
  });
}

function defaultRunCommand(
  input: RunCommandInput,
): FutureInstance<unknown, string> {
  return Future((reject, resolve) => {
    void execFileAsync(input.command, input.args, {
      cwd: input.cwd,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    }).then((result) => resolve(result.stdout), reject);

    return () => undefined;
  });
}

export function discoverLinearIssues(
  input: LinearDiscoverInput,
  dependencies: DiscoverDependencies = {},
): FutureInstance<unknown, LinearDiscoverIssue[]> {
  const runCommand = dependencies.runCommand ?? defaultRunCommand;

  return Future((reject, resolve) => {
    runCommand({
      cwd: input.repoRoot,
      command: resolveLinearBinary(input.repoRoot),
      args: [
        "issue",
        "list",
        "--project",
        input.project,
        "--status",
        "backlog",
        "--status",
        "todo",
        "--json",
        "identifier,title,url,priority,priorityLabel,status,project,assignee,labels",
        "--limit",
        "250",
      ],
    }).pipe(
      fork(reject)((payload) => {
        try {
          resolve(parseLinearDiscoverPayload(payload));
        } catch (error) {
          reject(error);
        }
      }),
    );

    return () => undefined;
  });
}
