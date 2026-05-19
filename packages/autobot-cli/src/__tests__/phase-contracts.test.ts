import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getSingleTrackPhaseContractPath,
  listSingleTrackPhaseContractNames,
  loadSingleTrackPhaseContract,
} from "../phase-contracts";

function assertContains(content: string, snippet: string): void {
  assert.ok(
    content.includes(snippet),
    `expected contract to include: ${snippet}`,
  );
}

test("Autobot phase contracts are tracked markdown files", () => {
  const repoPath = path.resolve(process.cwd(), "..", "..");

  for (const name of listSingleTrackPhaseContractNames()) {
    const contractPath = getSingleTrackPhaseContractPath(repoPath, name);

    assert.match(contractPath, /packages\/autobot-cli\/contracts\/.*\.md$/);
    assert.doesNotThrow(() => readFileSync(contractPath, "utf8"));
  }
});

test("Autobot phase contracts declare exact inputs and outputs", () => {
  const expectations = [
    {
      name: "prepare",
      snippets: [
        "Load `delivery-workflow`, `implementation-rigor`, and `test-plan`",
        "Load `linear-cli` before any Linear read or mutation",
        "Read the queued issue",
        "linear issue children <issue-id> --json",
        "reproctl wt list --json",
        "gh pr list --state open --limit 1000",
        "Stop before planning when the target has child issues",
        "Stop before planning when any blocker is not `Done` or `Canceled`",
        "appears in an open PR branch",
        "If UI context is the only missing prerequisite",
        "add `needs-spec`",
        ".autobot/runs/<issue-id>/attempt-<attempt>/context.md",
        ".autobot/runs/<issue-id>/attempt-<attempt>/test-plan.md",
        "Write or refresh the run context artifacts",
        "readiness decision: `proceed`, `research-refine`, or `escalate`",
      ],
    },
    {
      name: "classify",
      snippets: [
        "Classify the issue shape and make an explicit routing decision",
        "Write `issue_shapes` as an array of every matching shape",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/classify.md` artifact; stdout is process output only",
        "If multiple shapes apply, include them all",
        "Treat `issue_shapes` as the authoritative classification input for later routing",
        "## Shape rubric",
        "`feature`: adds new user-visible or operator-visible behavior",
        "`bug`: fixes broken, regressed, flaky, or incorrect behavior",
        "`ui-bearing`: changes a user interface, visual design, interaction behavior, accessibility, or browser-visible state",
        "Confirm the prepare readiness gates have passed before setting `route: proceed`",
        "Route",
        "research-refine",
        "route: escalate",
        "ready_to_proceed",
      ],
    },
    {
      name: "research-refine",
      snippets: [
        "Load `delivery-workflow` and the relevant domain skill(s)",
        "Read the latest `run-plan.md`",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/research-refine.md` artifact; stdout is process output only",
        "needs_research",
        "not_ready",
        "mechanical QC failure",
        "If the missing input is UI direction, capture the required design context block before returning to planning",
        "return an escalation reason instead of forcing a plan",
        "Write the refined research notes or plan deltas",
      ],
    },
    {
      name: "plan",
      snippets: [
        "Fetch the Linear issue with `linear issue show",
        "Read `context.md`",
        "Read `test-plan.md`",
        "Load `delivery-workflow`, `implementation-rigor`, `test-plan`, and any relevant domain skill(s)",
        "Read `issue_shapes` from classify output",
        "require `## Design Direction`, `## Targeted Design Edit`, or `## Design Handoff Context`",
        "Do not write source files",
        "Do not write files except the authorized `run-plan.md` artifact and friction log",
        "Log planning friction to `tmp/friction.md`",
        "Write only the durable `.autobot/runs/<issue-id>/attempt-<attempt>/run-plan.md` artifact; stdout is process output only",
        "## Readiness",
        "## Sequence Notes",
        "## Risk Notes",
        "## Plan",
        "Add `## Open Questions` only when the readiness sentinel is not `ready_to_proceed`, and keep it non-empty when present",
        "Require non-empty bodies for `## Readiness`, `## Sequence Notes`, `## Risk Notes`, and `## Plan`",
        "`## Readiness` must start with one of `ready_to_proceed`, `needs_research`, `not_ready`, or `escalate`",
        "List every file this plan will write or modify",
        "For shared or high-risk files within this issue, specify the exact edit location or section",
        "route to `research-refine`",
        "If schema or database signals appear, include a migration step",
        "If the plan lists more than 15 files or identifies a large diff",
      ],
    },
    {
      name: "risk-assess",
      snippets: [
        "Assess post-plan implementation risk and select the review lane set",
        "Read the approved `run-plan.md` after planning is complete",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/risk-assessment.md` artifact; stdout is process output only",
        "Derive risk only from post-plan evidence",
        "Read `issue_shapes` from classify output as a shape signal",
        "Set `risk_level: high` when two or more risk signals are present",
        "Security-sensitive: touches auth, permissions, tokens, encryption, or user data models",
        "Data model: includes schema, migration, or database-operation changes",
        "Always include `review-standard`",
        "Include `review-ui-quality` when `issue_shapes` includes `ui-bearing`",
        "risk-assessment.md",
      ],
    },
    {
      name: "develop",
      snippets: [
        "Load `implementation-rigor`",
        "Read the approved `run-plan.md`",
        "Verify the worktree exists and the current branch matches the issue branch before editing",
        "Do not re-explore from scratch unless the plan explicitly calls for it",
        "Write the smallest safe code diff",
        "matching test updates",
        "Do not push or create a PR",
        "If the plan has a strategic mismatch",
        "For UI-bearing work, run an authored-polish self-critique",
        "Log implementation friction to `tmp/friction.md`",
        ".autobot/runs/<issue-id>/attempt-<attempt>/implementation-summary.md",
        "Keep verification separate",
      ],
    },
    {
      name: "test-verify",
      snippets: [
        "Load `build-and-test` and `testing-workflow`",
        "Read the implementation diff, the `run-plan.md`",
        "Determine affected packages from `git diff main...HEAD --name-only`",
        "Prefer `moon run repro/<name>:test`",
        "Treat a missing package test script as skipped, not failed",
        "Execute the focused tests, smoke tests, and typechecks",
        "Write the smoke-test and typecheck evidence",
        ".autobot/runs/<issue-id>/attempt-<attempt>/smoke-test-result.md",
        "For failures, record package name, failing test file when known, and condensed error output",
        "Keep verification failure evidence separate from publishability",
        "Do not edit source files",
      ],
    },
    {
      name: "review-standard",
      snippets: [
        "Load `review-standards`",
        "Read the diff, the `run-plan.md`, the `risk-assessment.md`, the `smoke-test-result.md`",
        "Fetch the Linear issue before reviewing",
        "Review the committed branch diff with `git diff main...HEAD`",
        "classify each failure as `caused-by-this-change` or `pre-existing`",
        "Return the structured output required by `.opencode/agents/review.md`",
        "Assign each finding `role: standard`",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/review-standard.md` artifact; stdout is process output only",
        "correctness, clarity, and merge-readiness",
      ],
    },
    {
      name: "review-correctness-security",
      snippets: [
        "Load the `review-standards` skill",
        "Read the diff, the `run-plan.md`, the `risk-assessment.md`, the `smoke-test-result.md`",
        "Evaluate async correctness, auth, permissions, injection, data exposure, and unsafe deserialization when relevant",
        "Assign each finding `role: correctness-security`",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/review-correctness-security.md` artifact; stdout is process output only",
      ],
    },
    {
      name: "review-architecture-conventions",
      snippets: [
        "Load the `review-standards` skill",
        "Read the diff, the `run-plan.md`, the `risk-assessment.md`, the `smoke-test-result.md`",
        "Check affected package `AGENTS.md` conventions when present",
        "Assign each finding `role: architecture-conventions`",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/review-architecture-conventions.md` artifact; stdout is process output only",
      ],
    },
    {
      name: "review-performance",
      snippets: [
        "Load the `review-standards` skill",
        "Read the diff, the `run-plan.md`, the `risk-assessment.md`, the `smoke-test-result.md`",
        "Evaluate algorithmic regressions, unnecessary iteration, missing pagination, excessive memory use, and missing database indexes when relevant",
        "Assign each finding `role: performance`",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/review-performance.md` artifact; stdout is process output only",
      ],
    },
    {
      name: "review-ui-quality",
      snippets: [
        "Load the `review-standards` skill and `audit-ui-quality`",
        "Read the diff, the `run-plan.md`, the `risk-assessment.md`, the `smoke-test-result.md`",
        "Read `## Targeted Design Edit`, `## Design Direction`, and `## Design Handoff Context` when present",
        "Evaluate authored polish separately from design-system compliance",
        "Assign each finding `role: ui-quality`",
        "Write the durable `.autobot/runs/<issue-id>/attempt-<attempt>/review-ui-quality.md` artifact; stdout is process output only",
      ],
    },
    {
      name: "review-fix",
      snippets: [
        "Read the lane-specific review artifacts, the `run-plan.md`, and the `smoke-test-result.md`",
        "Run only when every blocking finding to address is `fixable_by_agent: true`",
        "Stop and escalate when any blocker is not agent-fixable",
        "Write the smallest follow-up diff",
        ".autobot/runs/<issue-id>/attempt-<attempt>/review-fix.md",
        "Do not start a fourth fix attempt after three consecutive unsuccessful fix attempts",
        "Do not push or create a PR from this phase",
      ],
    },
    {
      name: "reconcile",
      snippets: [
        "Read the implementation outcome, verification evidence",
        "Reconcile the run state and decide whether the issue is complete",
        "Do not mark complete when review has unresolved blockers",
        "Preserve events, logs, and artifacts",
        ".autobot/runs/<issue-id>/attempt-<attempt>/reconcile.md",
        "Report ambiguous state with exact mismatch and recovery commands",
      ],
    },
    {
      name: "release-publish",
      snippets: [
        "Load `git-workflow` and `build-and-test`",
        "Read the completed run state, the final verification evidence",
        "deterministic pre-push rebase guard",
        "On rebase conflict, capture conflicting files, abort the rebase",
        "Retry transient push failures up to three times",
        "Create a PR body with `Closes <issue-id>`",
        "Do not paste full AI review output into the PR or Linear comments",
        "Do not wait on CI, merge status, or post-publish monitoring",
        "bounded agent-fixable pre-push or check-failure recovery plan",
        ".autobot/runs/<issue-id>/attempt-<attempt>/release-recovery.md",
        ".autobot/runs/<issue-id>/attempt-<attempt>/release-publish.md",
      ],
    },
  ] as const;

  for (const expectation of expectations) {
    const content = loadSingleTrackPhaseContract(expectation.name);

    for (const snippet of expectation.snippets) {
      assertContains(content, snippet);
    }

    assert.doesNotMatch(content, /\/deliver/i);
    assert.doesNotMatch(content, /\bresequenc/i);
    assert.doesNotMatch(content, /\bbatch\b/i);
    assert.doesNotMatch(content, /\bwave\b/i);
    assert.doesNotMatch(content, /sibling-issue/i);
    assert.doesNotMatch(content, /single-track/i);
  }
});
