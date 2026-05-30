import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ItemState } from "@repro/autobot-core";

import { runPlanningSessionPreflight } from "../planning-session";
import { extractSafetySignals } from "../services";

// -- Helpers ------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "autobot-safety-guard-"));
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// -- Preflight tests ----------------------------------------------------------

test("runPlanningSessionPreflight blocks when cc-safety-net is missing", () => {
  const dir = makeTempDir();
  try {
    // Write a valid config without cc-safety-net in the plugin list
    writeJson(path.join(dir, ".opencode", "opencode.json"), {
      plugin: ["some-other-plugin"],
    });

    const result = runPlanningSessionPreflight({
      repoPath: dir,
      issueId: "REP-1304",
    });

    assert.equal(result.ok, false);
    assert.ok(result.error !== undefined);
    assert.equal(result.error.code, "SAFETY_FORBIDDEN_COMMAND");
    assert.match(
      result.error.message,
      /cc-safety-net is not active in OpenCode config/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runPlanningSessionPreflight passes when config file is missing (no OpenCode config to verify)", () => {
  const dir = makeTempDir();
  try {
    const result = runPlanningSessionPreflight({
      repoPath: dir,
      issueId: "REP-1304",
    });

    assert.equal(result.ok, true);
    assert.equal(result.error, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runPlanningSessionPreflight passes when cc-safety-net is active", () => {
  const dir = makeTempDir();
  try {
    writeJson(path.join(dir, ".opencode", "opencode.json"), {
      plugin: ["cc-safety-net", "some-other-plugin"],
    });

    const result = runPlanningSessionPreflight({
      repoPath: dir,
      issueId: "REP-1304",
    });

    assert.equal(result.ok, true);
    assert.equal(result.error, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runPlanningSessionPreflight blocks when plugin array is missing", () => {
  const dir = makeTempDir();
  try {
    writeJson(path.join(dir, ".opencode", "opencode.json"), {
      version: 1,
    });

    const result = runPlanningSessionPreflight({
      repoPath: dir,
      issueId: "REP-1304",
    });

    assert.equal(result.ok, false);
    assert.ok(result.error !== undefined);
    assert.match(
      result.error.message,
      /cc-safety-net is not active in OpenCode config/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// -- extractSafetySignals tests -----------------------------------------------

function makeMockPlan(overrides: {
  stdout?: string;
  stderr?: string;
  attempt?: number;
  issueId?: string;
  runId?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  command?: string;
  args?: string[];
  itemState?: ItemState;
}): Parameters<typeof extractSafetySignals>[0] {
  const sessionResult = {
    command: overrides.command ?? "opencode",
    args: overrides.args ?? ["run"],
    started_at: "2026-05-15T12:00:00Z",
    finished_at: "2026-05-15T12:00:01Z",
    exit_code: overrides.exitCode ?? 0,
    signal: overrides.signal ?? null,
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
  };

  return {
    workflow: { workflow_id: "autobot-deliver-issue", version: "1.0.0" } as any,
    execution_id: "exec-test",
    run_id: overrides.runId ?? "run-test",
    issue_id: overrides.issueId ?? "REP-TEST",
    started_at: "2026-05-15T12:00:00Z",
    finished_at: "2026-05-15T12:00:01Z",
    transport: null,
    metadata: {
      workflow_id: "autobot-deliver-issue",
      workflow_version: "1.0.0",
      workflow_status: "completed" as any,
      item_state: (overrides.itemState ?? "planning") as ItemState,
      bounded: true as any,
      phase_sequence: ["planning"],
      loop: {
        id: "review-loop",
        attempt_limit: 3,
        exhausted: false,
        attempts: 0,
        continued: false,
        body: {},
      } as any,
      node_outputs: [],
      planning_artifacts: [],
      planning_session_result: sessionResult as any,
      planning_run_plan_valid: true,
      planning_run_plan_ready: true,
      planning_should_fail: false,
      planning_failure_reason: null,
      recovery_commands: [],
      safety_stop: null,
      terminal_state: { state: "completed" as ItemState, reason: "ok" },
      serialized_context: "{}",
    } as any,
    flowcraft_events: [],
    domain_events: [],
  };
}

test("extractSafetySignals returns null for normal output", () => {
  const plan = makeMockPlan({
    stdout: "## Readiness\nready_to_proceed\n\n## Plan\n- Do stuff\n",
  });

  const result = extractSafetySignals(plan, 1);
  assert.equal(result, null);
});

test("extractSafetySignals detects safety stop marker in stdout", () => {
  const plan = makeMockPlan({
    stdout:
      'safety.stop {"kind":"safety-stop","violations":[{"code":"SAFETY_FORBIDDEN_COMMAND"}]}',
    itemState: "planning",
    issueId: "REP-123",
    runId: "run-abc",
  });

  const result = extractSafetySignals(plan, 3);
  assert.notEqual(result, null);
  assert.notEqual(result, null);
  assert.equal(result!.disposition, "escalated");
  assert.equal(result!.issue_id, "REP-123");
  assert.equal(result!.run_id, "run-abc");
  assert.equal(result!.attempt, 3);
  assert.equal(result!.phase, "planning");
  assert.equal(result!.violations.length, 1);
  assert.equal(result!.violations[0]!.code, "SAFETY_FORBIDDEN_COMMAND");
  assert.ok(
    result!.recovery_commands.length > 0,
    "recovery commands should be non-empty",
  );
  assert.ok(
    result!.operator_message.length > 0,
    "operator message should be non-empty",
  );
});

test("extractSafetySignals detects safety stop marker in stderr", () => {
  const plan = makeMockPlan({
    stdout: "## Readiness\nready_to_proceed\n",
    stderr:
      'safety.stop {"kind":"safety-stop","violations":[{"code":"SAFETY_FORBIDDEN_COMMAND"}]}',
    itemState: "developing",
  });

  const result = extractSafetySignals(plan, 2);
  assert.notEqual(result, null);
  assert.equal(result!.attempt, 2);
  assert.equal(result!.phase, "developing");
});

test("extractSafetySignals uses the actual attempt number", () => {
  const plan = makeMockPlan({
    stdout: 'safety.stop {"kind":"safety-stop"}',
    issueId: "REP-456",
    runId: "run-def",
  });

  const result1 = extractSafetySignals(plan, 1);
  assert.equal(result1!.attempt, 1);

  const result5 = extractSafetySignals(plan, 5);
  assert.equal(result5!.attempt, 5);
});

test("extractSafetySignals returns null when planning_session_result is null", () => {
  const plan = makeMockPlan({});
  plan.metadata.planning_session_result = null;

  const result = extractSafetySignals(plan, 1);
  assert.equal(result, null);
});

// -- Relay parity test --------------------------------------------------------

test("safety guard types are re-exported from autobot-adapters for relay parity", async () => {
  // Dynamic import to avoid static resolution issues
  const adapters = await import("@repro/autobot-adapters");

  // All safety guard functions should be re-exported
  assert.equal(typeof adapters.classifyCommand, "function");
  assert.equal(typeof adapters.isPhaseAllowed, "function");
  assert.equal(typeof adapters.checkCcSafetyNetPreflight, "function");
  assert.equal(typeof adapters.createForbiddenCommandSafetyStop, "function");

  // Verify the functions work as expected (smoke test)
  const category = adapters.classifyCommand("git", ["log", "--oneline"]);
  assert.equal(category, "read-only-git");

  const allowed = adapters.isPhaseAllowed("safe-shell", "autobot-planner");
  assert.equal(allowed, true);

  // Verify a forbidden classification
  const forbidden = adapters.classifyCommand("git", ["reset", "--hard"]);
  assert.equal(forbidden, "destructive-git");
});
