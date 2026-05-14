import test from "node:test";

import type { ItemDetail, ItemSummary } from "@repro/autobot-core";

import { assertNormalizedEqual } from "./helpers";
import {
  renderAutobotItemDetail,
  renderAutobotItemSummary,
} from "../render/human";

test("item summary renderer uses the shared core contract", () => {
  const item: ItemSummary = {
    issue_id: "REP-1151",
    title: "Build Autobot CLI parser, JSON envelopes, and renderers",
    url: "https://linear.app/repro/issue/REP-1151/build-autobot-cli-parser-json-envelopes-and-renderers",
    state: "queued",
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-1151",
    queued_at: "2026-05-14T11:00:00Z",
    started_at: null,
    updated_at: "2026-05-14T11:20:00Z",
    last_event: null,
    last_error: null,
  };

  assertNormalizedEqual(
    renderAutobotItemSummary(item),
    `
    REP-1151 · Build Autobot CLI parser, JSON envelopes, and renderers
    State: queued
    Priority: 2
    Owner: Gary
    Workspace: autobot
    Branch: autobot/REP-1151
    `,
  );
});

test("failed item detail renderer keeps semantic next-step guidance", () => {
  const item: ItemDetail = {
    issue_id: "REP-1151",
    title: "Build Autobot CLI parser, JSON envelopes, and renderers",
    url: "https://linear.app/repro/issue/REP-1151/build-autobot-cli-parser-json-envelopes-and-renderers",
    state: "failed",
    attempt: 2,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-1151",
    queued_at: "2026-05-14T11:00:00Z",
    started_at: "2026-05-14T11:10:00Z",
    updated_at: "2026-05-14T11:20:00Z",
    last_event: "retry.failed",
    last_error: {
      code: "AUTOBOT-RETRY-NOT-ALLOWED",
      message: "retry is only available after failed runs",
      occurred_at: "2026-05-14T11:19:00Z",
    },
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    recovery_commands: ["autobot-next status REP-1151 --json"],
    artifacts: [],
    events: [],
  };

  assertNormalizedEqual(
    renderAutobotItemDetail(item),
    `
    REP-1151 · Build Autobot CLI parser, JSON envelopes, and renderers
    State: failed
    Priority: 2
    Owner: Gary
    Workspace: autobot
    Branch: autobot/REP-1151
    Last event: retry.failed
    Last error: AUTOBOT-RETRY-NOT-ALLOWED — retry is only available after failed runs
    Next:
    autobot-next status REP-1151 --json
    `,
  );
});
