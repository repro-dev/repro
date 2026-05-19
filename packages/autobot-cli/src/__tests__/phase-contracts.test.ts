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
        "Read the queued issue",
        "`context.md`",
        "`test-plan.md`",
        "Write or refresh the run context artifacts",
      ],
    },
    {
      name: "classify",
      snippets: [
        "Classify the issue shape and make an explicit routing decision",
        "Write `issue_shapes` as an array of every matching shape",
        "If multiple shapes apply, include them all",
        "Treat `issue_shapes` as the authoritative classification input for later routing",
        "Route",
        "research-refine",
        "ready to proceed",
      ],
    },
    {
      name: "research-refine",
      snippets: [
        "Load `delivery-workflow` and the relevant domain skill(s)",
        "Read the latest `run-plan.md`",
        "needs_research",
        "not_ready",
        "mechanical QC failure",
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
        "Write the authoritative `run-plan.md`",
        "## Readiness",
        "## Sequence Notes",
        "## Risk Notes",
        "## Plan",
        "Add `## Open Questions` only when unresolved blockers remain",
        "list every file this plan will write or modify",
        "route to `research-refine`",
      ],
    },
    {
      name: "develop",
      snippets: [
        "Load `implementation-rigor`",
        "Read the approved `run-plan.md`",
        "Write the smallest safe code diff",
        "matching test updates",
        "implementation-summary.md",
        "verification is separate",
      ],
    },
    {
      name: "test-verify",
      snippets: [
        "Load `build-and-test` and `testing-workflow`",
        "Read the implementation diff, the `run-plan.md`",
        "execute the focused tests, smoke tests, and typechecks",
        "Write the smoke-test and typecheck evidence",
        "Do not edit source files",
      ],
    },
    {
      name: "review-standard",
      snippets: [
        "Load `review-standards`",
        "Read the diff, the `run-plan.md`, the `smoke-test-result.md`",
        "Write `review-output.md`",
        "correctness, clarity, and merge-readiness",
      ],
    },
    {
      name: "review-correctness-security",
      snippets: [
        "Load the `review-standards` skill",
        "Read the diff, the `run-plan.md`, the `smoke-test-result.md`",
        "Write `review-output.md` with correctness, safety, and security findings",
      ],
    },
    {
      name: "review-architecture-conventions",
      snippets: [
        "Load the `review-standards` skill",
        "Read the diff, the `run-plan.md`, the `smoke-test-result.md`",
        "Write `review-output.md` with architectural-fit and convention-drift findings",
      ],
    },
    {
      name: "review-performance",
      snippets: [
        "Load the `review-standards` skill",
        "Read the diff, the `run-plan.md`, the `smoke-test-result.md`",
        "Write `review-output.md` with latency, cost, and unnecessary churn findings",
      ],
    },
    {
      name: "review-ui-quality",
      snippets: [
        "Load the `review-standards` skill and `audit-ui-quality`",
        "Read the diff, the `run-plan.md`, the `smoke-test-result.md`",
        "Write `review-output.md` with clarity, polish, and authored-vs-generic quality findings",
      ],
    },
    {
      name: "review-fix",
      snippets: [
        "Read `review-output.md`, the `run-plan.md`, the `smoke-test-result.md`",
        "Write the smallest follow-up diff",
      ],
    },
    {
      name: "reconcile",
      snippets: [
        "Read the implementation outcome, verification evidence",
        "Reconcile the run state and decide whether the issue is complete",
      ],
    },
    {
      name: "release-publish",
      snippets: [
        "Load `git-workflow` and `build-and-test`",
        "Read the completed run state, the final verification evidence",
        "deterministic pre-push rebase guard",
        "bounded agent-fixable pre-push or check-failure recovery plan",
        "release-recovery.md",
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
