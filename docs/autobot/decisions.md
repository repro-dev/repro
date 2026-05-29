# Greenfield Autobot Decisions

These decisions are locked before starting implementation of `REP-1149`.

## 1. Spec Location

Detailed specs live in tracked repo docs under `docs/autobot/`. Linear issues track scope and sequencing; these docs carry detailed schemas, event taxonomies, error contracts, and renderer examples.

## 2. Package Layout

Use five greenfield packages:

- `packages/autobot-core`
- `packages/autobot-store`
- `packages/autobot-cli`
- `packages/autobot-flowcraft`
- `packages/autobot-adapters`

## 3. Store Access

`packages/autobot-store` uses Kysely over SQLite.

- SQLite file: `.autobot/autobot.sqlite`
- Enable WAL mode.
- Autobot domain tables are the product source of truth.
- FlowCraft history is execution evidence.

## 4. CLI Parser

`packages/autobot-cli` uses Commander.

- Commander owns command tree, args, flags, help text, and basic shape validation.
- Domain logic stays out of Commander callbacks.
- Command handlers call application services.
- Human/JSON renderers are separate and testable.

## 5. FlowCraft Authoring

`packages/autobot-flowcraft` uses FlowCraft builder/fluent APIs initially.

- Do not use the FlowCraft compiler for the first implementation.
- Use explicit stable node IDs for projection, status, logs, inspect, and recovery.
- Revisit compiler only after the full local delivery flow is proven.

Initial node IDs should map to product phases where possible:

- `claim-item`
- `prepare-worktree`
- `plan-work`
- `run-opencode`
- `run-tests`
- `run-review`
- `reconcile-result`
- `complete-run`

## 6. FlowCraft History Storage

FlowCraft history lives in `.autobot/autobot.sqlite` with namespaced tables.

- `runs.flowcraft_execution_id` links Autobot run state to FlowCraft history.
- `autobot inspect` reads domain events and FlowCraft raw events from the same DB.
- If FlowCraft's SQLite adapter has strict schema requirements, wrap or configure it to use the same DB unless proven impossible.

## 7. Artifact Storage And Lineage

Physical artifacts are stored per attempt:

```text
.autobot/runs/<issue-id>/attempt-<n>/
```

Artifacts are immutable once recorded. SQLite stores artifact refs with producing run/attempt/state, kind, path, optional content hash, supersedes link, and inherited-from link.

Retries from a failed phase reuse prior successful phase artifacts by reference. New attempts only write artifacts for phases they actually rerun. `status <issue>` and `inspect` show whether each effective artifact is current or inherited.

## 8. Worktree Naming And Lifecycle

Use one canonical active worktree per issue.

- Branch: `autobot/<issue-id-slug>`
- Worktree: `.autobot/worktrees/<issue-id-slug>`

Rules:

- Clean retained worktree with expected branch/head: reuse.
- Dirty canceled worktree: block requeue by default.
- Dirty failed worktree: may be reused only for retry from recorded failed phase.
- Mismatched branch/head: archive and create fresh.
- Unverifiable worktree: fail with recovery commands or archive through reconcile if safe.
- Never silently delete retained worktrees.

Post-worktree workspace setup (REP-1234):

- Setup remains an observable sub-action inside public `preparing`; do not split MVP state into `preparing_worktree`, `bootstrapping_workspace`, or `validating_workspace`.
- Setup runs after git worktree create/reuse/archive and before planning.
- Ordered MVP actions: create run directories, copy local bootstrap config (`.linear` required and `.envrc.local` optional), run `pnpm install --frozen-lockfile`, run `moon run :build`, conditionally run `direnv allow`, then validate `node`, `pnpm`, `moon`, repo-local `linear`, and `opencode`.
- MVP explicitly does **not** run `pnpm bootstrap`; no such package script exists and worktree dependency bootstrap is the frozen-lockfile install.
- Setup runs on every preparation attempt and must be idempotent across retry from failed `preparing`.
- Status/log/inspect output distinguishes `workflow.worktree.*` events from `workflow.workspace_setup.*` events and records `.autobot/runs/<issue-id>/attempt-<n>/workspace-setup.json` as a summary artifact.
- Bootstrap, direnv, and validation failures preserve the prepared worktree path/branch on the item and return structured recovery commands for the failing step.

Future operator controls may include `autobot worktree status|archive|remove|reset`.

## 9. Linear Integration

The first Linear adapter uses the repo-owned `linear` CLI.

- Call `linear` only through `packages/autobot-adapters`.
- Prefer JSON output.
- Discover uses repeatable `--project` flags; omit `--project` entirely when no allowlist is configured so manual discovery can scan all projects.
- Missing Linear CLI capability is a dependency gap to fix in the repo-owned CLI, not a reason to add another Linear client.
- Keep behavior behind typed adapter interfaces so a future API client can replace the CLI backend if needed.

## 10. GitHub Integration

GitHub integration uses `gh` CLI through the adapter layer.

- `packages/autobot-adapters` owns all `gh` calls.
- Prefer JSON output.
- MVP uses GitHub only for inspection/reconciliation if needed.
- No PR creation, push, publish, or release behavior until the publish/release phase.

## 11. Test Phase Policy

The first real `testing` phase requires explicit config.

- Config key: `testing.command`
- Default: empty string.
- Empty value means `testing` is not runnable.
- If the workflow reaches `testing` without a command, fail fast with a configuration error and recovery commands.
- Run the command inside the issue worktree.
- Capture stdout/stderr into attempt artifacts.
- Do not auto-detect test commands initially.

## 12. Review Phase Policy

Defer exact review executor selection until `REP-1162`.

Locked boundary:

- `reviewing` is a first-class public state.
- Review runs after `testing`.
- Review output is captured as artifacts.
- Failed review marks item `failed` from `reviewing`.
- Passing review advances to `reconciling`.

## 13. Release/Publish Policy

Publish/release is fully deferred to `REP-1164`.

- No PR creation before `REP-1164`.
- No branch push before `REP-1164`.
- No `autobot release` before `REP-1164`.
- No public `released` state before `REP-1164`.
- Successful local terminal state is `completed`.
- `completed` means local workflow phases passed and reconciliation found the work internally consistent.
- `completed` does not mean published, pushed, merged, or human-approved.

## 14. Buildout Binary Name

Expose the greenfield implementation as `autobot-next` until cutover.

- Target public CLI is `autobot-next`.
- Package is `@repro/autobot-cli`.
- Tests and early Linear acceptance criteria should use `autobot-next`.
- No public `autobot` entrypoint is exposed during the rewrite.
- `REP-1165` owns any future rename, redirect, or replacement decision.

## 15. Phase Agent Permission Model

Adopted **2026-05-29** as part of REP-1313.

The greenfield Autobot model uses 5 phase-specific agents (`autobot-planner`, `autobot-developer`, `autobot-reviewer`, `autobot-review-fixer`, `autobot-publisher`) as the primary phase-authority boundary:

- Each agent has an explicit permission profile covering read, write, edit, shell, patch, publish, GitHub, and Linear authority, defined in `packages/autobot-core/src/phase-agents.ts` and enforced at the OpenCode agent config level (`.opencode/agents/autobot-*.md`).
- `cc-safety-net` remains a mandatory cross-cutting defense-in-depth guardrail for shell-capable sessions but is no longer the primary phase-policy mechanism.
- Permissions are declared at the agent config level as tool/bash allow/deny rules, not enforced through command-output parsing.
- Agent Relay sessions use the same phase-agent contract and permission profiles. Relay is transport-only.
- Publish authority is gated in `autobot-publisher` and remains separated from all other phases.
- REP-1304 will implement forbidden-command safety guards as a follow-up enforcement layer.

## 16. Agent Session Safety Policy

Autobot-managed agent sessions must follow `docs/autobot/safety-policy.md`.

- Safety stops are represented as `awaiting` or `escalated`, not collapsed into generic `failed`, when the stop needs human decision, policy clarification, or recovery before continuing.
- Publish authority remains gated. No unattended push, PR, release, deploy, package publish, or Linear completion mutation is allowed unless a later policy explicitly grants that authority for a low-risk class.
- Agent Relay is transport-only. It may broker execution but must not become policy authority, expand write roots, downgrade safety stops, or grant publish authority.
- Local process and Agent Relay transports must use allowlisted environment and credential propagation with redaction before prompts, logs, artifacts, status, inspect, or dashboard output.
