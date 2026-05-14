import assert from "node:assert/strict";
import test from "node:test";

import {
  renderJsonErrorEnvelope,
  renderJsonSuccessEnvelope,
} from "../render/json";

test("json success envelopes use the documented top-level shape", () => {
  const output = renderJsonSuccessEnvelope({
    command: "autobot-next list --json",
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    data: { items: [] },
    warnings: [
      {
        code: "AUTOBOT-001",
        message: "dry run only",
        severity: "warning",
      },
    ],
  });

  assert.deepStrictEqual(JSON.parse(output), {
    schema_version: 1,
    ok: true,
    command: "autobot-next list --json",
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    data: { items: [] },
    warnings: [
      {
        code: "AUTOBOT-001",
        message: "dry run only",
        severity: "warning",
      },
    ],
  });
});

test("json error envelopes omit repo when absent and keep recovery guidance", () => {
  const output = renderJsonErrorEnvelope({
    command: "autobot-next retry REP-123",
    error: {
      code: "AUTOBOT-RETRY-NOT-ALLOWED",
      message: "retry is only available after failed runs",
      what_failed: "retry request",
      likely_cause: "the item is not in failed state",
      recovery_commands: [
        "autobot-next status REP-123 --json",
        "autobot-next cancel REP-123",
      ],
      details: null,
    },
  });

  const envelope = JSON.parse(output);

  assert.equal(envelope.ok, false);
  assert.equal(envelope.command, "autobot-next retry REP-123");
  assert.equal("repo" in envelope, false);
  assert.deepStrictEqual(envelope.error.recovery_commands, [
    "autobot-next status REP-123 --json",
    "autobot-next cancel REP-123",
  ]);
});
