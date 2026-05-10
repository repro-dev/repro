import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fragmentPaths = [
  ".opencode/skills/delivery-workflow/references/deliver-command-contract.md",
  ".opencode/skills/delivery-workflow/references/deliver-single-track.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-1-scan-and-select.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-2-provisional-sequencing.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-3-worktrees.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-4-plan.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-5-risk-and-resequence.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-6-implement.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-7-review.md",
  ".opencode/skills/delivery-workflow/references/deliver-phase-8-publish.md",
  ".opencode/skills/delivery-workflow/references/deliver-throughout.md",
  ".opencode/skills/delivery-workflow/references/deliver-verification.md",
];

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractFragmentPaths(text: string) {
  return [
    ...text.matchAll(
      /\.opencode\/skills\/delivery-workflow\/references\/[a-z0-9-]+\.md/g,
    ),
  ].map((match) => match[0]);
}

describe("REP-1132 delivery fragment wiring", () => {
  it("keeps the shared fragments present and non-empty", () => {
    for (const fragmentPath of fragmentPaths) {
      assert.ok(
        existsSync(path.join(repoRoot, fragmentPath)),
        `missing ${fragmentPath}`,
      );
      assert.ok(
        readText(fragmentPath).trim().length > 0,
        `empty ${fragmentPath}`,
      );
    }
  });

  it("points the command and skill at the same fragment set", () => {
    const commandPaths = new Set(
      extractFragmentPaths(readText(".opencode/commands/deliver.md")),
    );
    const skillPaths = new Set(
      extractFragmentPaths(
        readText(".opencode/skills/delivery-workflow/SKILL.md"),
      ),
    );

    assert.deepEqual(commandPaths, skillPaths);
    assert.deepEqual(commandPaths, new Set(fragmentPaths));
  });

  it("preserves the documented deliver modes in the command contract", () => {
    const contract = readText(
      ".opencode/skills/delivery-workflow/references/deliver-command-contract.md",
    );

    assert.match(contract, /\/deliver --project <project>/);
    assert.match(contract, /\/deliver --issue REP-123/);
    assert.match(contract, /--wave-concurrency <1-6>/);
  });

  it("keeps deliver.md as a shim instead of phase bodies", () => {
    const deliverCommand = readText(".opencode/commands/deliver.md");

    assert.doesNotMatch(
      deliverCommand,
      /## Single-track mode \(replaces Phases 1 and 2\)/,
    );
    assert.doesNotMatch(deliverCommand, /## Phase 1: Scan and select/);
    assert.doesNotMatch(
      deliverCommand,
      /## Phase 8: Publish the active ready wave and stop/,
    );
    assert.doesNotMatch(deliverCommand, /## Throughout/);
    assert.match(deliverCommand, /Read these canonical fragments in order:/);
  });

  it("keeps runtime-only interpolation out of the shared command contract", () => {
    const contract = readText(
      ".opencode/skills/delivery-workflow/references/deliver-command-contract.md",
    );

    assert.doesNotMatch(contract, /\$ARGUMENTS/);
    assert.doesNotMatch(contract, /!`git branch --show-current`/);
  });

  it("separates local-only and CI-enforced verification wording", () => {
    const verification = readText(
      ".opencode/skills/delivery-workflow/references/deliver-verification.md",
    );

    assert.match(verification, /## Local-only \/ orchestrator checks/);
    assert.match(verification, /## CI-enforced checks/);
    assert.ok(verification.includes("does **not** wait on CI"));
  });
});
