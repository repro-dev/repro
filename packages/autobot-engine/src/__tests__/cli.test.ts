import assert from "node:assert/strict";
import test from "node:test";

test("select-work forwards allow_recovery=false to the core", async (t) => {
  const calls: Array<{ options?: { allowRecovery?: boolean } }> = [];

  t.mock.module("node:fs", {
    namedExports: {
      readFileSync: () => JSON.stringify({ allow_recovery: false }),
    },
  });

  t.mock.module("../core", {
    namedExports: {
      decideRecovery: () => ({
        action: "continue",
        reason: "noop",
        fetch_main: false,
        cleanup_eligible: false,
      }),
      processQueue: () => ({
        items: [],
        summary: {},
        selected_work: null,
        generated_at: "2026-05-08T12:00:00Z",
      }),
      selectWork: (
        _payload: unknown,
        options: { allowRecovery?: boolean } = {},
      ) => {
        calls.push({ options });
        return {
          selected: null,
          summary: {
            selected_issue_identifier: "",
            selected_state: "",
            allow_recovery: options.allowRecovery ?? true,
          },
        };
      },
      trackedTasks: () => [],
      transition: () => ({
        taskId: "",
        currentState: "queued",
        nextState: null,
        reason: "",
        effects: [],
      }),
    },
  });

  try {
    const { main } = await import("../cli");
    main(["node", "cli", "select-work"]);
  } finally {
    /* noop */
  }

  assert.equal(calls[0]?.options?.allowRecovery, false);
});
