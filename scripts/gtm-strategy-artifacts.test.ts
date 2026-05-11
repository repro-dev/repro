import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("REP-1059 gtm strategy wiring", () => {
  it("registers the new workflow skill in AGENTS.md", () => {
    const agents = readText("AGENTS.md");

    assert.match(
      agents,
      /- `gtm-strategy-workflow` — launch goal to durable GTM plan/,
    );
  });

  it("keeps gtm-plan as a thin command shim", () => {
    const command = readText(".opencode/commands/gtm-plan.md");

    assert.match(command, /Load the `gtm-strategy-workflow` skill\./);
    assert.match(command, /tmp\/gtm-plan-<topic>\.md/);
    assert.match(
      command,
      /do not create issues or execution assets without explicit approval\./,
    );
    assert.doesNotMatch(command, /## Goal/);
    assert.doesNotMatch(command, /## Channel Strategy/);
    assert.doesNotMatch(command, /## Launch Sequence/);
    assert.doesNotMatch(command, /## Success Criteria/);
  });

  it("keeps the GTM workflow skill aligned with the durable artifact shape", () => {
    const skill = readText(".opencode/skills/gtm-strategy-workflow/SKILL.md");

    for (const section of [
      "## Goal",
      "## Audience",
      "## Positioning",
      "## Scope Now",
      "## Later / Out Of Scope",
      "## Channel Strategy",
      "## Launch Sequence",
      "## Success Criteria",
      "## Risks And Assumptions",
      "## Open Decisions",
      "## Follow-On Issue Proposals",
    ]) {
      assert.ok(skill.includes(section), `missing ${section}`);
    }

    assert.match(
      skill,
      /Do not write campaign copy, build launch assets, or create Linear issues until the strategy is approved\./,
    );
    assert.match(skill, /Durable artifact: `tmp\/gtm-plan-<topic>\.md`/);
  });
});
