import assert from "node:assert/strict";
import test from "node:test";

import type { ItemDetail, ItemSummary } from "@repro/autobot-core";

import { assertNormalizedEqual } from "./helpers";
import {
  renderAutobotDiscoverResults,
  renderAutobotFlowcraftInspect,
  renderAutobotItemDetail,
  renderAutobotItemSummary,
  renderAutobotQueueStatus,
  renderAutobotWorkflowDiagram,
  renderAutobotWorkflowList,
  renderAutobotWorkflowValidation,
} from "../render/human";
import type { DiscoverData } from "../types";

test("workflow renderers keep the stable FlowCraft skeleton visible", () => {
  assertNormalizedEqual(
    renderAutobotWorkflowList([
      {
        id: "autobot-deliver-issue",
        version: "1.0.0",
        description: "Claim an issue, reconcile the state, then complete it.",
        node_ids: ["claim", "reconcile", "complete"],
        edge_count: 2,
      },
    ]),
    `
    Workflow list
    autobot-deliver-issue v1.0.0 · claim → reconcile → complete
    `,
  );

  assertNormalizedEqual(
    renderAutobotWorkflowValidation([
      {
        workflow_id: "autobot-deliver-issue",
        valid: true,
        analysis: {
          cycles: [],
          startNodeIds: ["claim"],
          terminalNodeIds: ["complete"],
          nodeCount: 3,
          edgeCount: 2,
          isDag: true,
        },
        lint: {
          isValid: true,
          issues: [],
        },
        issues: [],
      },
    ]),
    `
    Workflow validation
    autobot-deliver-issue: valid
    `,
  );

  assert.match(
    renderAutobotWorkflowDiagram("flowchart TD\nclaim --> reconcile\n"),
    /flowchart TD/,
  );
});

test("queue status renderer includes tick metadata when available", () => {
  assertNormalizedEqual(
    renderAutobotQueueStatus(
      {
        engine: {
          state: "unknown",
          pid: null,
          started_at: null,
          last_tick_at: "2026-05-15T11:00:00Z",
          tick_interval_seconds: 15,
          queue_depth: 3,
          max_concurrency: 1,
          active_runs: 0,
          active_workers: [],
          health: [],
        },
        counts: {
          queued: 0,
          claimed: 0,
          preparing: 0,
          planning: 0,
          developing: 0,
          testing: 0,
          reviewing: 0,
          reconciling: 0,
          awaiting: 0,
          failed: 0,
          completed: 0,
          canceled: 0,
        },
        items: [],
        config: [],
      },
      { color: false },
    ),
    `
    Queue status
    Engine: unknown
    Counts: queued: 0, claimed: 0, preparing: 0, planning: 0, developing: 0, testing: 0, reviewing: 0, reconciling: 0, awaiting: 0, failed: 0, completed: 0, canceled: 0
    Last tick: 2026-05-15T11:00:00Z
    Tick scope: queue scheduler
    `,
  );
});

test("flowcraft inspect renderer includes persisted transports but keeps raw payloads scoped", () => {
  assertNormalizedEqual(
    renderAutobotFlowcraftInspect({
      lookup: {
        kind: "flowcraft-execution",
        identifier: "exec-1154",
        issue_id: "REP-1154",
        run: {
          run_id: "run-1154",
          issue_id: "REP-1154",
          attempt: 1,
          state: "completed",
          flowcraft_execution_id: "exec-1154",
          blueprint_id: "autobot-deliver-issue",
          blueprint_version: "1.0.0",
          started_at: "2026-05-15T11:00:00Z",
          finished_at: "2026-05-15T11:00:01Z",
          worker_id: null,
          last_heartbeat_at: null,
          transport: {
            source: "relay",
            workspace_id: "relay-workspace",
            channel_id: "relay-channel",
            thread_id: "relay-thread",
            agent_id: "relay-agent",
            message_id: "relay-message",
          },
        },
        execution: {
          execution_id: "exec-1154",
          issue_id: "REP-1154",
          run_id: "run-1154",
          state: "completed",
          started_at: "2026-05-15T11:00:00Z",
          finished_at: "2026-05-15T11:00:01Z",
          metadata: {
            workflow_id: "autobot-deliver-issue",
            workflow_version: "1.0.0",
            bounded: true,
            status: "completed",
          },
        },
        domain_events: [
          {
            event_id: "event-1",
            issue_id: "REP-1154",
            run_id: "run-1154",
            type: "workflow.phase.claimed",
            state: "claimed",
            message: "Issue claimed",
            severity: "info",
            occurred_at: "2026-05-15T11:00:00Z",
            actor: "autobot-flowcraft",
            transport: null,
            data: {},
          },
        ],
        flowcraft_events: [
          {
            flowcraft_event_id: "flowcraft-1",
            execution_id: "exec-1154",
            node_id: "claim",
            type: "execution.started",
            occurred_at: "2026-05-15T11:00:00Z",
            data: {},
          },
        ],
      },
    }),
    `
    Inspect: exec-1154
    Lookup: flowcraft-execution
    Issue: REP-1154
    Execution: exec-1154
    Workflow state: completed
    Started: 2026-05-15T11:00:00Z
    Finished: 2026-05-15T11:00:01Z
    Metadata: {"workflow_id":"autobot-deliver-issue","workflow_version":"1.0.0","bounded":true,"status":"completed"}
    Transport:
      workspace_id: relay-workspace
      channel_id: relay-channel
    Domain events:
      2026-05-15T11:00:00Z workflow.phase.claimed Issue claimed
    FlowCraft events:
      2026-05-15T11:00:00Z claim execution.started {}
    `,
  );
});

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

test("discover renderer distinguishes empty scan, all excluded, and candidates", () => {
  const noRemoteScan: DiscoverData = {
    projects: [],
    query: null,
    filters: {
      labels: [],
      priority: null,
      limit: 5,
      scan_limit: 100,
    },
    scanned: 0,
    candidates: [],
    issue_ids: [],
    exclusions: [],
    quiet: false,
  };

  assertNormalizedEqual(
    renderAutobotDiscoverResults(noRemoteScan),
    `
    No remote issues scanned for all projects.
    Limit: 5
    `,
  );

  const allExcluded: DiscoverData = {
    projects: ["Engineering"],
    query: null,
    filters: {
      labels: [],
      priority: null,
      limit: 5,
      scan_limit: 100,
    },
    scanned: 2,
    candidates: [],
    issue_ids: [],
    exclusions: [
      {
        issue_id: "REP-200",
        reason: "local-non-terminal",
        details: {
          state: "failed",
        },
      },
    ],
    quiet: false,
  };

  assertNormalizedEqual(
    renderAutobotDiscoverResults(allExcluded),
    `
    Scanned 2 remote issues for Engineering; all excluded.
    Limit: 5

    Exclusions: 1
    REP-200 (local-non-terminal) {"state":"failed"}
    `,
  );

  const candidatesFound: DiscoverData = {
    projects: ["Engineering", "Platform"],
    query: "autobot",
    filters: {
      labels: ["backend"],
      priority: "high",
      limit: 2,
      scan_limit: 100,
    },
    scanned: 3,
    candidates: [
      {
        issue_id: "REP-201",
        title: "Candidate REP-201",
        url: "https://linear.app/repro/issue/REP-201",
        project: "Engineering",
        labels: ["backend"],
        priority: 2,
        priority_label: "High",
        status_name: "Todo",
        state_type: "unstarted",
        assignee: "Gary",
      },
    ],
    issue_ids: ["REP-201"],
    exclusions: [
      {
        issue_id: "REP-202",
        reason: "limit-reached",
        details: {
          limit: 2,
        },
      },
    ],
    quiet: false,
  };

  assertNormalizedEqual(
    renderAutobotDiscoverResults(candidatesFound),
    `
    Found 1 candidates for Engineering, Platform.
    Limit: 2
    Scanned 3 remote issues.

    REP-201 · Candidate REP-201

    Exclusions: 1 (see --json for details)
    `,
  );
});
