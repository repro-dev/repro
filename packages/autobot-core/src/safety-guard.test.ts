import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";

import type { AutobotPhaseAgentId } from "./phase-agents";
import type { CommandCategory } from "./contracts";
import {
  checkCcSafetyNetPreflight,
  classifyCommand,
  createForbiddenCommandSafetyStop,
  isPhaseAllowed,
} from "./safety-guard";

// -- Command classification --------------------------------------------------

test("destructive git commands are classified as destructive-git", () => {
  const cases: Array<[string, string[]]> = [
    ["git", ["reset", "--hard"]],
    ["git", ["reset", "--hard", "HEAD~1"]],
    ["git", ["clean", "-fd"]],
    ["git", ["clean", "-xfd"]],
    ["git", ["push", "--force", "origin", "main"]],
    ["git", ["push", "-f", "origin", "main"]],
    ["git", ["branch", "-D", "foo"]],
    ["git", ["push", "--delete", "origin", "foo"]],
    ["rm", ["-rf", ".git"]],
    ["git", ["reflog", "expire", "--all"]],
    ["git", ["gc"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "destructive-git",
      `"${command} ${args.join(" ")}" should be destructive-git`,
    );
  }
});

test("publish mutation commands are classified as publish-mutation", () => {
  const cases: Array<[string, string[]]> = [
    ["git", ["push", "origin", "main"]],
    ["gh", ["pr", "create", "--title", "feat: add x"]],
    ["gh", ["pr", "merge"]],
    ["git", ["commit", "-m", "feat: add feature"]],
    ["git", ["tag", "v1.0.0"]],
    ["linear", ["issue", "update", "REP-123", "--status", "In Review"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "publish-mutation",
      `"${command} ${args.join(" ")}" should be publish-mutation`,
    );
  }
});

test("credential inspection commands are classified as credential-inspection", () => {
  const cases: Array<[string, string[]]> = [
    ["security", ["find-generic-password"]],
    ["env", []],
    ["cat", [".env"]],
    ["gh", ["auth", "token"]],
    ["printenv", []],
    ["echo", ["$TOKEN"]],
    ["echo", ["$SECRET"]],
    ["echo", ["$PASSWORD"]],
    ["echo", ["$API_KEY"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "credential-inspection",
      `"${command} ${args.join(" ")}" should be credential-inspection`,
    );
  }
});

test("external side effect commands are classified as external-side-effect", () => {
  const cases: Array<[string, string[]]> = [
    ["curl", ["-X", "POST", "https://example.com/api"]],
    ["curl", ["-X", "PUT", "https://example.com/api"]],
    ["curl", ["-X", "PATCH", "https://example.com/api"]],
    ["curl", ["-X", "DELETE", "https://example.com/api"]],
    ["npm", ["publish"]],
    ["pnpm", ["publish"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "external-side-effect",
      `"${command} ${args.join(" ")}" should be external-side-effect`,
    );
  }
});

test("read-only git commands are classified as read-only-git", () => {
  const cases: Array<[string, string[]]> = [
    ["git", ["log"]],
    ["git", ["log", "--oneline"]],
    ["git", ["diff"]],
    ["git", ["diff", "--stat"]],
    ["git", ["show"]],
    ["git", ["show", "HEAD"]],
    ["git", ["status"]],
    ["git", ["branch", "--list"]],
    ["git", ["branch"]],
    ["git", ["remote", "-v"]],
    ["git", ["rev-parse", "--show-toplevel"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "read-only-git",
      `"${command} ${args.join(" ")}" should be read-only-git`,
    );
  }
});

test("safe shell commands are classified as safe-shell", () => {
  const cases: Array<[string, string[]]> = [
    ["moon", ["run", ":test"]],
    ["pnpm", ["install"]],
    ["pnpm", ["--dir", "packages/foo", "exec", "tsx"]],
    ["node", ["--version"]],
    ["tsx", ["--test", "file.test.ts"]],
    ["opencode", ["--version"]],
    ["prettier", ["--write", "src"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "safe-shell",
      `"${command} ${args.join(" ")}" should be safe-shell`,
    );
  }
});

test("unmatched commands are classified as uncategorized", () => {
  const cases: Array<[string, string[]]> = [
    ["ls", ["-la"]],
    ["echo", ["hello"]],
    ["which", ["node"]],
    ["python", ["--version"]],
  ];

  for (const [command, args] of cases) {
    assert.equal(
      classifyCommand(command, args),
      "uncategorized",
      `"${command} ${args.join(" ")}" should be uncategorized`,
    );
  }
});

test("classification priority: destructive-git beats publish-mutation", () => {
  // git push --force should be destructive-git, not publish-mutation
  assert.equal(
    classifyCommand("git", ["push", "--force", "origin", "main"]),
    "destructive-git",
  );
});

test("classification priority: credential-inspection beats safe-shell", () => {
  // env (bare) should be credential-inspection, not uncategorized
  assert.equal(classifyCommand("env", []), "credential-inspection");
});

// -- Phase boundary enforcement ----------------------------------------------

const phaseTestCases: Array<{
  agentId: AutobotPhaseAgentId;
  allowed: CommandCategory[];
  disallowed: CommandCategory[];
}> = [
  {
    agentId: "autobot-planner",
    allowed: ["read-only-git", "safe-shell", "uncategorized"],
    disallowed: [
      "destructive-git",
      "publish-mutation",
      "credential-inspection",
      "external-side-effect",
    ],
  },
  {
    agentId: "autobot-developer",
    allowed: ["safe-shell", "read-only-git", "uncategorized"],
    disallowed: [
      "destructive-git",
      "publish-mutation",
      "credential-inspection",
      "external-side-effect",
    ],
  },
  {
    agentId: "autobot-reviewer",
    allowed: ["read-only-git", "uncategorized"],
    disallowed: [
      "safe-shell",
      "destructive-git",
      "publish-mutation",
      "credential-inspection",
      "external-side-effect",
    ],
  },
  {
    agentId: "autobot-review-fixer",
    allowed: ["safe-shell", "read-only-git", "uncategorized"],
    disallowed: [
      "destructive-git",
      "publish-mutation",
      "credential-inspection",
      "external-side-effect",
    ],
  },
  {
    agentId: "autobot-publisher",
    allowed: [
      "destructive-git",
      "publish-mutation",
      "read-only-git",
      "safe-shell",
      "uncategorized",
    ],
    disallowed: ["credential-inspection", "external-side-effect"],
  },
];

for (const { agentId, allowed, disallowed } of phaseTestCases) {
  test(`phase boundary: ${agentId} allows expected categories`, () => {
    for (const category of allowed) {
      assert.equal(
        isPhaseAllowed(category, agentId),
        true,
        `${agentId} should allow ${category}`,
      );
    }
  });

  test(`phase boundary: ${agentId} blocks disallowed categories`, () => {
    for (const category of disallowed) {
      assert.equal(
        isPhaseAllowed(category, agentId),
        false,
        `${agentId} should NOT allow ${category}`,
      );
    }
  });
}

test("phase boundary: unknown agent returns false", () => {
  assert.equal(
    isPhaseAllowed("safe-shell", "autobot-unknown" as AutobotPhaseAgentId),
    false,
  );
});

// -- Concrete scenario tests ------------------------------------------------

test("planner cannot execute destructive git", () => {
  const category = classifyCommand("git", ["reset", "--hard"]);
  assert.equal(category, "destructive-git");
  assert.equal(isPhaseAllowed(category, "autobot-planner"), false);
});

test("planner cannot publish", () => {
  const category = classifyCommand("gh", [
    "pr",
    "create",
    "--title",
    "feat: add x",
  ]);
  assert.equal(category, "publish-mutation");
  assert.equal(isPhaseAllowed(category, "autobot-planner"), false);
});

test("developer cannot publish", () => {
  const category = classifyCommand("git", ["push"]);
  assert.equal(category, "publish-mutation");
  assert.equal(isPhaseAllowed(category, "autobot-developer"), false);
});

test("developer cannot inspect credentials", () => {
  const category = classifyCommand("gh", ["auth", "token"]);
  assert.equal(category, "credential-inspection");
  assert.equal(isPhaseAllowed(category, "autobot-developer"), false);
});

test("publisher can publish but cannot inspect credentials", () => {
  const publishCategory = classifyCommand("git", ["push"]);
  assert.equal(publishCategory, "publish-mutation");
  assert.equal(isPhaseAllowed(publishCategory, "autobot-publisher"), true);

  const credCategory = classifyCommand("gh", ["auth", "token"]);
  assert.equal(credCategory, "credential-inspection");
  assert.equal(isPhaseAllowed(credCategory, "autobot-publisher"), false);
});

test("publisher cannot cause external side effects", () => {
  const category = classifyCommand("curl", [
    "-X",
    "POST",
    "https://example.com",
  ]);
  assert.equal(category, "external-side-effect");
  assert.equal(isPhaseAllowed(category, "autobot-publisher"), false);
});

// -- cc-safety-net preflight -------------------------------------------------

test("cc-safety-net preflight: passes with active plugin", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safety-guard-"));
  const opencodeDir = path.join(tmpDir, ".opencode");
  fs.mkdirSync(opencodeDir, { recursive: true });
  fs.writeFileSync(
    path.join(opencodeDir, "opencode.json"),
    JSON.stringify({ plugin: ["cc-safety-net"] }),
  );

  try {
    const result = checkCcSafetyNetPreflight(tmpDir);
    assert.equal(result.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("cc-safety-net preflight: fails when plugin missing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safety-guard-"));
  const opencodeDir = path.join(tmpDir, ".opencode");
  fs.mkdirSync(opencodeDir, { recursive: true });
  fs.writeFileSync(
    path.join(opencodeDir, "opencode.json"),
    JSON.stringify({ plugin: ["other-plugin"] }),
  );

  try {
    const result = checkCcSafetyNetPreflight(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.message?.includes("cc-safety-net"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("cc-safety-net preflight: fails when config file missing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safety-guard-"));
  // Don't create .opencode directory at all

  try {
    const result = checkCcSafetyNetPreflight(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.message?.includes("cc-safety-net"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("cc-safety-net preflight: fails when config is invalid JSON", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safety-guard-"));
  const opencodeDir = path.join(tmpDir, ".opencode");
  fs.mkdirSync(opencodeDir, { recursive: true });
  fs.writeFileSync(path.join(opencodeDir, "opencode.json"), "not valid json");

  try {
    const result = checkCcSafetyNetPreflight(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.message?.includes("cc-safety-net"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("cc-safety-net preflight: fails when plugin array is absent", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safety-guard-"));
  const opencodeDir = path.join(tmpDir, ".opencode");
  fs.mkdirSync(opencodeDir, { recursive: true });
  fs.writeFileSync(
    path.join(opencodeDir, "opencode.json"),
    JSON.stringify({ notPlugin: "something" }),
  );

  try {
    const result = checkCcSafetyNetPreflight(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.message?.includes("plugin"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// -- Safety stop construction -------------------------------------------------

test("createForbiddenCommandSafetyStop produces structured safety stop", () => {
  const result = createForbiddenCommandSafetyStop({
    violation: {
      code: "SAFETY_FORBIDDEN_COMMAND",
      message: "git push --force is forbidden in this phase",
      phase: "developing",
      path: null,
      command: "git push --force",
      likely_cause: "The developer agent attempted a force push",
      evidence: { raw: "git push --force origin main" },
    },
    issueId: "REP-123",
    runId: "run-abc",
    attempt: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "safety-stop");
  assert.equal(result.next_state, "escalated");
  assert.equal(result.safety.issue_id, "REP-123");
  assert.equal(result.safety.run_id, "run-abc");
  assert.equal(result.safety.attempt, 1);
  assert.equal(result.safety.disposition, "escalated");
  assert.equal(result.safety.violations.length, 1);
  assert.equal(result.safety.violations[0]!.code, "SAFETY_FORBIDDEN_COMMAND");
  assert.equal(result.safety.violations[0]!.severity, "error");
  assert.ok(result.safety.recovery_commands.length > 0);
  assert.ok(result.safety.operator_message.length > 0);
});

test("createForbiddenCommandSafetyStop includes recovery commands", () => {
  const result = createForbiddenCommandSafetyStop({
    violation: {
      code: "SAFETY_WRITE_ROOT_VIOLATION",
      message: "Attempted write outside approved workspace",
      phase: "planning",
      path: "/etc/passwd",
      command: "write /etc/passwd",
      likely_cause:
        "The planner agent attempted a write outside approved roots",
      evidence: {},
    },
    issueId: "REP-456",
    runId: "run-xyz",
    attempt: 2,
  });

  assert.ok(
    result.safety.recovery_commands.some((cmd) =>
      cmd.includes("autobot-next status"),
    ),
  );
  assert.ok(
    result.safety.recovery_commands.some((cmd) =>
      cmd.includes("autobot-next cancel"),
    ),
  );
});
