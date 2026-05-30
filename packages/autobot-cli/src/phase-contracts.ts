import { readFileSync } from "node:fs";
import path from "node:path";

import {
  autobotPhaseAgentProfiles,
  type AutobotPhaseAgentId,
} from "@repro/autobot-core";

export type SingleTrackPhaseContractName =
  | "prepare"
  | "classify"
  | "research-refine"
  | "plan"
  | "risk-assess"
  | "develop"
  | "test-verify"
  | "review-standard"
  | "review-correctness-security"
  | "review-architecture-conventions"
  | "review-performance"
  | "review-ui-quality"
  | "review-fix"
  | "reconcile"
  | "release-publish";

const singleTrackPhaseContractFileNames: Record<
  SingleTrackPhaseContractName,
  string
> = {
  prepare: "prepare.md",
  classify: "classify.md",
  "research-refine": "research-refine.md",
  plan: "plan.md",
  "risk-assess": "risk-assess.md",
  develop: "develop.md",
  "test-verify": "test-verify.md",
  "review-standard": "review-standard.md",
  "review-correctness-security": "review-correctness-security.md",
  "review-architecture-conventions": "review-architecture-conventions.md",
  "review-performance": "review-performance.md",
  "review-ui-quality": "review-ui-quality.md",
  "review-fix": "review-fix.md",
  reconcile: "reconcile.md",
  "release-publish": "release-publish.md",
};

const singleTrackPhaseContractRelativeDir = path.join(
  "packages",
  "autobot-cli",
  "contracts",
);

const singleTrackPhaseContractDir = path.resolve(__dirname, "..", "contracts");

const safetyPreamble = readFileSync(
  path.join(singleTrackPhaseContractDir, "safety-preamble.md"),
  "utf8",
);

export function listSingleTrackPhaseContractNames(): SingleTrackPhaseContractName[] {
  return Object.keys(
    singleTrackPhaseContractFileNames,
  ) as SingleTrackPhaseContractName[];
}

export function getSingleTrackPhaseContractRelativePath(
  name: SingleTrackPhaseContractName,
): string {
  return path.join(
    singleTrackPhaseContractRelativeDir,
    singleTrackPhaseContractFileNames[name],
  );
}

export function getSingleTrackPhaseContractPath(
  repoPath: string,
  name: SingleTrackPhaseContractName,
): string {
  return path.join(repoPath, getSingleTrackPhaseContractRelativePath(name));
}

export function loadSingleTrackPhaseContract(
  name: SingleTrackPhaseContractName,
): string {
  const phaseContract = readFileSync(
    path.join(
      singleTrackPhaseContractDir,
      singleTrackPhaseContractFileNames[name],
    ),
    "utf8",
  );

  return `${safetyPreamble.trimEnd()}\n\n${phaseContract}`;
}

function resolvePhaseAgentForContract(
  name: SingleTrackPhaseContractName,
): AutobotPhaseAgentId {
  switch (name) {
    case "prepare":
    case "classify":
    case "research-refine":
    case "plan":
    case "risk-assess":
      return "autobot-planner";
    case "develop":
    case "test-verify":
      return "autobot-developer";
    case "review-standard":
    case "review-correctness-security":
    case "review-architecture-conventions":
    case "review-performance":
    case "review-ui-quality":
      return "autobot-reviewer";
    case "review-fix":
      return "autobot-review-fixer";
    case "reconcile":
    case "release-publish":
      return "autobot-publisher";
  }
}

export function renderSingleTrackPhaseContract(
  name: SingleTrackPhaseContractName,
  input: {
    issueId: string;
    attempt: number;
  },
): string {
  const phaseAgent = resolvePhaseAgentForContract(name);
  const profile = autobotPhaseAgentProfiles[phaseAgent];

  const authorityBlock = profile
    ? [
        "## Phase Agent Authority",
        "",
        `- Agent: ${profile.agentId}`,
        `- Description: ${profile.description}`,
        `- Shell permissions: ${profile.shell}`,
        `- Write permissions: ${profile.write ? "yes" : "no"}`,
        `- Edit permissions: ${profile.edit ? "yes" : "no"}`,
        `- Publish permissions: ${profile.publish ? "yes" : "no"}`,
        `- Patch tool: ${profile.patch ? "yes" : "no"}`,
        `- GitHub operations: ${profile.github}`,
        `- Linear operations: ${profile.linear}`,
        "",
      ].join("\n")
    : "";

  return `${loadSingleTrackPhaseContract(name)
    .replaceAll("<issue-id>", input.issueId)
    .replaceAll("<attempt>", String(input.attempt))}\n${authorityBlock}`;
}
