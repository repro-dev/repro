import { readFileSync } from "node:fs";
import path from "node:path";

import type { AutobotPhaseAgentId } from "./phase-agents";
import type {
  CommandCategory,
  ItemState,
  PhaseSafetyResult,
  SafetyStopPayload,
  SafetyViolation,
  SafetyViolationCode,
} from "./contracts";

// -- Command classification --------------------------------------------------

export interface CommandClassificationInput {
  command: string;
  args: string[];
}

const destructiveGitPatterns: RegExp[] = [
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[fx]/,
  /\bgit\s+clean\s+(-f|-x)\b/,
  /\bgit\s+clean\s+-[a-z]*[fx]/i,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+branch\s+-D\b/,
  /\brm\s+-rf\s+.*\.git\b/,
  /\bgit\s+reflog\s+expire\b/,
  /\bgit\s+gc\b/,
  /\bgit\s+push\s+.*--delete\b/,
  /\bgit\s+push\s+-f\b/,
];

const publishMutationPatterns: RegExp[] = [
  /\bgit\s+push\b/,
  /\bgh\s+pr\s+create\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgit\s+commit\b/,
  /\bgit\s+tag\b/,
  /\blinear\s+issue\s+update\b.*--status/,
];

const credentialInspectionPatterns: RegExp[] = [
  /\bsecurity\s+find-generic-password\b/,
  /^\s*env\s*$/,
  /\bcat\s+.*\.env\b/,
  /\bgh\s+auth\s+token\b/,
  /^\s*printenv\s*$/,
  /\becho\s+\$TOKEN\b/,
  /\becho\s+\$SECRET\b/,
  /\becho\s+\$PASSWORD\b/,
  /\becho\s+\$API_KEY\b/,
];

const externalSideEffectPatterns: RegExp[] = [
  /\bcurl\b.*-X\s+POST/,
  /\bcurl\b.*-X\s+PUT/,
  /\bcurl\b.*-X\s+PATCH/,
  /\bcurl\b.*-X\s+DELETE/,
  /\bwget\b(?!\s+\S*localhost)/,
  /\bnpm\s+publish\b/,
  /\bpnpm\s+publish\b/,
];

const readOnlyGitPatterns: RegExp[] = [
  /\bgit\s+log\b/,
  /\bgit\s+diff\b/,
  /\bgit\s+show\b/,
  /\bgit\s+status\b/,
  /\bgit\s+branch\b(?!\s+-D)/,
  /\bgit\s+remote\b/,
  /\bgit\s+rev-parse\b/,
];

const safeShellPatterns: RegExp[] = [
  /\bmoon\s+run\b/,
  /\bpnpm\s+install\b/,
  /\bpnpm\s+--dir\b/,
  /^node\b/,
  /^tsx\b/,
  /^opencode\b/,
  /\bprettier\b/,
  /^typecheck\b/,
  /^tsc\b/,
];

function combineInput(cmd: string, args: string[]): string {
  return [cmd, ...args].join(" ");
}

function matchesAny(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

export function classifyCommand(
  command: string,
  args: string[],
): CommandCategory {
  const combined = combineInput(command, args);

  if (matchesAny(combined, destructiveGitPatterns)) {
    return "destructive-git";
  }

  if (matchesAny(combined, credentialInspectionPatterns)) {
    return "credential-inspection";
  }

  if (matchesAny(combined, externalSideEffectPatterns)) {
    return "external-side-effect";
  }

  if (matchesAny(combined, publishMutationPatterns)) {
    return "publish-mutation";
  }

  if (matchesAny(combined, readOnlyGitPatterns)) {
    return "read-only-git";
  }

  if (matchesAny(combined, safeShellPatterns)) {
    return "safe-shell";
  }

  return "uncategorized";
}

// -- Phase boundary enforcement -----------------------------------------------

const phaseAllowedCategories: Record<
  AutobotPhaseAgentId,
  readonly CommandCategory[]
> = {
  "autobot-planner": ["read-only-git", "safe-shell", "uncategorized"],
  "autobot-developer": ["safe-shell", "read-only-git", "uncategorized"],
  "autobot-reviewer": ["read-only-git", "uncategorized"],
  "autobot-review-fixer": ["safe-shell", "read-only-git", "uncategorized"],
  // autobot-publisher is handled separately in isPhaseAllowed via exclusion list —
  // the allowlist entry here is never consulted but satisfies the Record contract.
  "autobot-publisher": [],
};

const publisherExcludedCategories: readonly CommandCategory[] = [
  "credential-inspection",
  "external-side-effect",
];

export function isPhaseAllowed(
  category: CommandCategory,
  agentId: AutobotPhaseAgentId,
): boolean {
  // Publisher is allowed everything EXCEPT credential-inspection and external-side-effect.
  if (agentId === "autobot-publisher") {
    return !publisherExcludedCategories.includes(category);
  }

  const allowed = phaseAllowedCategories[agentId];
  if (allowed === undefined) {
    return false;
  }

  return allowed.includes(category);
}

// -- cc-safety-net preflight -------------------------------------------------

export interface SafetyGuardPreflightResult {
  ok: boolean;
  message?: string;
}

export function checkCcSafetyNetPreflight(
  repoPath: string,
): SafetyGuardPreflightResult {
  const configPath = path.join(repoPath, ".opencode", "opencode.json");

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    // Config file missing — no OpenCode configuration to verify, preflight passes.
    return { ok: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      message: [
        "cc-safety-net is not active in OpenCode config",
        "",
        `The OpenCode config at ${configPath} is not valid JSON.`,
        "cc-safety-net must be present in the plugin array of .opencode/opencode.json.",
        "",
        "Add 'cc-safety-net' to the plugin array in .opencode/opencode.json.",
      ].join("\n"),
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      message: [
        "cc-safety-net is not active in OpenCode config",
        "",
        `The OpenCode config at ${configPath} does not contain an expected object shape.`,
        "cc-safety-net must be present in the plugin array of .opencode/opencode.json.",
        "",
        "Add 'cc-safety-net' to the plugin array in .opencode/opencode.json.",
      ].join("\n"),
    };
  }

  const config = parsed as Record<string, unknown>;
  if (!Array.isArray(config.plugin)) {
    return {
      ok: false,
      message: [
        "cc-safety-net is not active in OpenCode config",
        "",
        `The OpenCode config at ${configPath} does not include a plugin array.`,
        "Add 'cc-safety-net' to the plugin array in .opencode/opencode.json.",
      ].join("\n"),
    };
  }

  const hasCcSafetyNet = config.plugin.some(
    (entry: unknown) => typeof entry === "string" && entry === "cc-safety-net",
  );

  if (!hasCcSafetyNet) {
    return {
      ok: false,
      message: [
        "cc-safety-net is not active in OpenCode config",
        "",
        `The OpenCode config at ${configPath} does not include cc-safety-net in its plugin list.`,
        "",
        "Add 'cc-safety-net' to the plugin array in .opencode/opencode.json.",
      ].join("\n"),
    };
  }

  return { ok: true };
}

// -- Safety stop construction -------------------------------------------------

export function createForbiddenCommandSafetyStop(input: {
  violation: {
    code: SafetyViolationCode;
    message: string;
    phase: ItemState;
    path: string | null;
    command: string | null;
    likely_cause: string;
    evidence: Record<string, unknown>;
  };
  issueId: string;
  runId: string;
  attempt: number;
}): PhaseSafetyResult {
  const violation: SafetyViolation = {
    code: input.violation.code,
    message: input.violation.message,
    phase: input.violation.phase,
    severity: "error",
    path: input.violation.path,
    command: input.violation.command,
    likely_cause: input.violation.likely_cause,
    evidence: input.violation.evidence,
  };

  const safety: SafetyStopPayload = {
    disposition: "escalated", // forbidden commands always escalate
    issue_id: input.issueId,
    run_id: input.runId,
    attempt: input.attempt,
    phase: input.violation.phase,
    violations: [violation],
    recovery_commands: [
      `autobot-next status ${input.issueId} --json`,
      `autobot-next cancel ${input.issueId} --reason "safety stop"`,
    ],
    operator_message:
      "A forbidden command was blocked in this phase. Inspect the safety violation evidence to understand what was attempted and why it was denied.",
  };

  return {
    ok: false,
    kind: "safety-stop",
    next_state: "escalated",
    safety,
  };
}
