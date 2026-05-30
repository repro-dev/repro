export { prepareAutobotWorktree, resolveAutobotWorktreePaths } from "./git";
export { discoverLinearIssues, loadLinearIssue } from "./linear";
export { setupAutobotWorkspace } from "./workspace-setup";
export type { LinearDiscoverInput, LinearDiscoverIssue } from "./linear";
export type {
  GitWorktreePreparationInput,
  GitWorktreePreparationResult,
} from "./git";
export type {
  WorkspaceSetupInput,
  WorkspaceSetupProgressRecord,
  WorkspaceSetupResult,
  WorkspaceSetupStepName,
  WorkspaceSetupStepResult,
} from "./workspace-setup";

// -- Safety guard re-exports for Agent Relay parity --------------------------
// These exports are required so that Agent Relay-backed Autobot sessions have
// equivalent unsafe-shell-command filtering access. Relay is a transport
// boundary only — it uses the same types and guard functions as local sessions.

export {
  checkCcSafetyNetPreflight,
  classifyCommand,
  createForbiddenCommandSafetyStop,
  isPhaseAllowed,
} from "@repro/autobot-core";

export type {
  CommandCategory,
  PhaseSafetyResult,
  SafetyStopDisposition,
  SafetyStopPayload,
  SafetyViolation,
  SafetyViolationCode,
} from "@repro/autobot-core";
