# Autobot Agent Session Safety Policy

## Scope And Invariants

This policy governs Autobot-managed OpenCode sessions for dry-run, develop, test, review, review-fix, reconciliation, and publish-prep phases. It is normative for local process execution and the future Agent Relay transport.

Safety is a phase result, not an implementation detail. When a session detects a safety violation or an ambiguous safety signal, it must stop, preserve evidence, and return a structured `awaiting` or `escalated` outcome instead of continuing or collapsing the stop into a generic failure.

Core invariants:

- Autobot acts only inside the issue workspace, durable run artifact tree, and worktree-local temporary artifact tree assigned to the run.
- Human publish authority remains gated unless a later policy explicitly allows unattended publish for a low-risk class.
- Agent Relay is a transport boundary only. It must not become the source of safety policy, credential policy, or publish authority.
- All safety stops must include concrete operator recovery commands that are safe to run, preferring `--dry-run` for mutating recovery checks.

## Approved Write Roots

Autobot-managed sessions may write only to the following roots:

| Root                                       | Allowed Phases                                        | Purpose                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Issue worktree source tree                 | `develop`, `review-fix`                               | Planned source, test, and documentation edits for the current issue only.                                              |
| `.autobot/runs/<issue-id>/attempt-<n>/...` | all phases                                            | Durable context, plans, logs, summaries, prompts, test results, review artifacts, safety stops, and recovery evidence. |
| Worktree-local `tmp/`                      | planning/develop/test/review/reconcile support phases | Ephemeral scratch output, friction logs, screenshots, local test artifacts, and transient diagnostics.                 |

Disallowed write targets include the main checkout, sibling worktrees, user home directories, `/tmp`, retained worktree history outside the assigned issue worktree, credentials stores, global tool configuration, package registries, external services, and any path not resolved under one of the approved roots.

## Forbidden Operations

The following operations are forbidden unless a later phase-specific policy explicitly grants authority:

- Destructive git commands: `git reset --hard`, `git clean -fd`, forced branch deletion, history rewrite, force-push, reflog cleanup, garbage collection used to discard evidence, or deleting retained worktrees/history.
- Unapproved publish mutations: branch push, PR creation/update, release publication, deployment, package publication, Linear status mutation, or GitHub mutation outside the publish-prep contract.
- Credential exfiltration or unnecessary credential inspection, including printing secrets, copying env files into artifacts, uploading tokens, or expanding secret-bearing variables into prompts/logs.
- External side effects outside approved adapters and phase authority, including direct network writes, database mutations outside the configured Autobot store, package installs that mutate global state, or shell commands that alter the host outside the workspace.
- Continuing from unexpected dirty state, branch mismatch, missing run artifacts, or mismatch between the assigned issue and active worktree.

## Environment And Credential Handling

Local process transport:

- Inherit only the minimal allowlisted environment needed for repo tools, Linear/GitHub read adapters, OpenCode, and build/test commands.
- Redact secret-looking values from prompts, logs, event payloads, artifacts, and inspect output.
- Never persist raw tokens, cookies, private keys, `.env*` values, shell histories, or credential helper output.
- Treat credential discovery commands and env dumps as secret exposure risks unless the command is explicitly allowlisted and its output is redacted.

Agent Relay transport:

- Relay receives the same phase contract and the same allowlisted environment/credential bundle as local process transport.
- Relay may broker execution but must not expand write roots, grant publish authority, override recovery commands, or downgrade safety stops.
- Relay logs and remote artifacts must apply the same redaction rules as local artifacts before status, logs, inspect, or dashboard surfacing.
- Relay connection, identity, and provenance metadata may be recorded as evidence, but credentials used to establish the relay must never be recorded.

## Phase Action Matrix

| Phase             | Allowed Action Classes                                                                                                                                                                      | Disallowed Action Classes                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dry-run/read-only | Read Linear/GitHub through configured adapters, inspect repo metadata, validate config, render proposed actions, write dry-run evidence under `.autobot/runs/...` or `tmp/`.                | Source edits, test/build commands that write outputs outside `tmp/`, git mutations, Linear/GitHub mutations, publish actions, credential dumps.              |
| Develop           | Read issue/context/test-plan/approved plan, edit planned files in the issue worktree, add matching tests/docs, run focused tests/typecheck/format, write implementation/friction artifacts. | Push/PR/release, destructive git, edits outside plan scope or approved roots, global installs, broad redesign after strategic mismatch, secret inspection.   |
| Test              | Read diff and test plan, run configured package tests/smoke/typecheck commands, write logs and verification artifacts.                                                                      | Source edits, dependency installs unless explicitly part of workspace setup, publish mutations, destructive cleanup of test evidence, bypassing failures.    |
| Review            | Read issue, plan, diff, tests, and artifacts; run read-only inspections; write review findings.                                                                                             | Source edits, applying fixes, status mutation, push/PR/release, destructive git, commands with external side effects.                                        |
| Review-fix        | Read review artifacts, apply only agent-fixable blocking fixes inside the issue worktree, run focused verification, write fix summary.                                                      | Fixing non-agent-fixable blockers, fourth consecutive automatic fix attempt, scope expansion, publish mutations, destructive git.                            |
| Reconciliation    | Read store, FlowCraft history, git status, worker state, artifacts, Linear/GitHub metadata through adapters; repair only explicitly safe local state mismatches; write reconcile evidence.  | Source edits, deleting retained worktrees/history, publish mutations, remote state changes unless explicitly authorized, masking ambiguous state.            |
| Publish-prep      | Read final run state, verification evidence, reviews, branch status, and PR preflight data; prepare deterministic publish evidence and recovery plan.                                       | Unattended push/PR/release unless future policy enables it, force-push, merge, release, package publish, Linear completion mutation, bypassing failed gates. |

## Safety Stop Triggers

A session must stop with a safety result when it observes any of the following:

- Write root violation or uncertain path resolution.
- Forbidden command or tool invocation request.
- Unexpected dirty state, branch mismatch, missing worktree, mismatched issue ID, or untracked changes outside the phase scope.
- Secret exposure risk in command output, prompt material, artifact content, or environment propagation.
- External side effect risk not covered by the active phase contract or adapter boundary.
- Publish mutation request before explicit publish authority is granted.
- Conflicting evidence where continuing could delete evidence, hide a failure, or mutate external state incorrectly.

## Result Taxonomy

Safety stops use the structured shapes in `implementation-contracts.md`.

- `awaiting`: the safe recovery path is known and requires an operator decision or command before retry.
- `escalated`: Autobot cannot determine a safe automatic recovery, the requested operation exceeds policy, or a human must inspect possible data/credential exposure.
- `failed`: reserved for ordinary unrecovered execution failures that are not safety stops.

## Operator Recovery Commands

Safety results should include one or more of these recovery command patterns, specialized with the concrete issue or run ID:

- Inspect state: `autobot status <issue> --json`, `autobot inspect <run-id> --json`, `autobot logs <issue> -t`.
- Preview repair: `autobot reconcile <issue> --dry-run`, `autobot reconcile --all --dry-run`.
- Retry after operator remediation: `autobot retry <issue> --dry-run`, then `autobot retry <issue>` only after evidence is understood.
- Stop unsafe work: `autobot cancel <issue> --reason "safety stop"`.
- Validate workspace manually: `git -C <worktree> status --short --branch`, `git -C <worktree> diff --stat`.

Recovery commands must not instruct operators to run destructive git, print secrets, force publish, or delete evidence.

## Enforcement Backlog

REP-1227 defines the policy and contract shapes. Follow-up implementation issues should cover:

- Write-root validation for Autobot-managed sessions.
- Forbidden-command and destructive-git guards before session execution.
- Secret/env allowlist and redaction handling for local and Agent Relay transports.
- Persistence and surfacing of structured safety-stop results in status/logs/inspect/dashboard.
- Operator recovery command implementations for safety stops.
