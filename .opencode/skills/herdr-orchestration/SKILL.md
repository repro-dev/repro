---
name: herdr-orchestration
description: Coordinate across herdr workspaces and inject context into OpenCode sessions running in other workspaces. Load when orchestrating work across multiple worktrees, poking idle sessions to fix CI, broadcasting tasks, or running cross-workspace sweeps.
---

# Herdr Orchestration

Use this skill to discover, inspect, and inject context into OpenCode sessions running in other herdr workspaces. The core pattern: from one OpenCode session, drive work in other sessions by finding them via the herdr socket API and sending them tasks.

## Relationship with `deliver` CLI

The `deliver` CLI (`scripts/deliver.sh`, invoked as `deliver REP-123`) is the primary entry point for kicking off scoped delivery work. It:

1. Creates a worktree via `reproctl wt create --from-issue <issue-id>`
2. Adds a herdr sibling workspace with a shell pane (`:p1`) and an OpenCode agent pane (`:p2`)
3. Bootstraps the workspace (`pnpm bootstrap` in `:p1`, async)
4. Launches OpenCode in `:p2` with the appropriate command (`/build` or `/bugfix`)
5. Labels the OpenCode agent `opencode-REP-XXXX` (or `opencode` for non-issue label workspaces)

**How orchestration supports `deliver`:**

- **Pre-flight dedup**: before calling `deliver REP-123`, scan `herdr workspace list` for an existing workspace on that issue's branch. If found, attach rather than re-create.
- **Post-launch context injection**: after `deliver` creates a workspace and the agent goes idle (bootstrap + initial exploration done), inject follow-up context — test plan, known gotchas, dependency notes.
- **Wave coordination**: when `deliver` is called for multiple issues in a batch, the orchestrator tracks all sessions, fans out context, and monitors completion.
- **Post-PR feedback loop**: after a PR is reviewed, find the workspace for that branch and inject review feedback or CI fix instructions — the same pattern we used for the CI triage sweep.
- **Completion detection**: monitor `herdr agent wait <target> --status done` to know when a delivered issue's work is complete (PR opened, Linear transitioned).

## Discovery

### List all workspaces

```sh
herdr workspace list
```

Returns JSON with `workspace_id`, `label`, `worktree.checkout_path`, `worktree.repo_name`, `agent_status`, and `pane_count`.

**Match workspaces to PRs**: map `worktree.checkout_path` against `git worktree list` output to correlate workspaces with branches. Branch names encode the issue (`gary/rep-XXXX-...`).

**Quick cross-reference**: pipe through `jq` to extract labels + paths + status:

```sh
herdr workspace list | jq -r '.result.workspaces[] | "\(.workspace_id)\t\(.label)\t\(.worktree.checkout_path // "N/A")\t\(.agent_status)"'
```

### List panes in a workspace

```sh
herdr pane list --workspace <workspace_id>
```

Each pane has:
- `pane_id` — stable identifier (e.g. `w0:p2`)
- `agent` — `"opencode"` if it's an OpenCode session, absent otherwise
- `agent_status` — `idle`, `working`, `blocked`, `unknown`, `done`
- `agent_session` — `{ source, agent, kind, value }` with the session ID
- `label` — human-readable label (e.g. `opencode-REP-1275`)
- `cwd` — working directory (matches the worktree path)
- `terminal_id` — raw terminal identifier (alternative target for `agent prompt`)

### Deliver workspace layout

`deliver` creates workspaces with a 2-pane layout (opencode left, terminal right):

```
┌─────────────────────┬──────────┐
│                     │          │
│   opencode (70%)    │ terminal │
│   :p1               │ :p2 (30%)│
│                     │          │
└─────────────────────┴──────────┘
```

- `:p1` — OpenCode pane (70% left). Agent name: `opencode-REP-XXXX`
- `:p2` — Terminal shell (right 30%), used for deferred `pnpm install`

If the split fails, falls back to a single-pane layout (opencode only) and
installs dependencies synchronously.

**Find the OpenCode pane**: filter for `agent == "opencode"`. In a
`deliver`-created workspace, `:p1` is OpenCode and `:p2` is the shell.

### Resolve a target for herdr commands

All `herdr agent` and `herdr pane` commands accept these interchangeably:
- **Agent label** — e.g. `opencode-REP-1275` (most readable, preferred; `deliver` names them this way)
- **Pane ID** — e.g. `w0:p2` (always works, fallback when no label)
- **Terminal ID** — e.g. `term_6561b9f8acabca` (rarely needed)

Use the label when present. Fall back to the pane ID for older sessions without named labels.

## Status inspection

### Check agent status at workspace level

```sh
herdr workspace list | jq -r '.result.workspaces[] | "\(.label)\t\(.agent_status)\t\(.worktree.checkout_path // "N/A")"'
```

Status values: `idle` (ready to receive work), `working` (busy), `blocked` (needs intervention), `done` (completed), `unknown` (no agent detected).

### Read agent output

```sh
herdr agent read <target>                # visible viewport (default)
herdr agent read <target> --source recent           # scrollback buffer
herdr agent read <target> --source recent-unwrapped # scrollback, no soft-wrap
herdr agent read <target> --lines 100               # last 100 lines
herdr agent read <target> --format ansi             # preserve ANSI codes
```

Use `--source recent` to see full command output history. Use `--lines N` to cap.

### Wait for agent to become idle

```sh
herdr agent wait <target> --status idle --timeout 300000   # 5 minutes
```

Blocks until the agent finishes working or the timeout expires. Useful for chaining: inject context, wait for completion, then inspect results.

## Context injection

### Primary: send a prompt to an OpenCode session

`herdr agent prompt` types text into the agent pane and presses Enter. It can optionally wait for the agent to finish:

```sh
herdr agent prompt <target> "Your message or command here"
```

For synchronous injection (wait until idle):

```sh
herdr agent prompt <target> "message text" --wait --until idle --timeout 300000
```

`herdr agent prompt` replaces the v0.7.4 `agent send + pane send-keys enter` pattern. Do NOT use `herdr pane run` for OpenCode panes — that's for shell panes only.

### Injection message structure

Every injected message must include these three things so the receiving OpenCode session can act autonomously:

1. **What's wrong** — the concrete failure or task (CI check name, error symptom, merge conflict status)
2. **Where to look** — the PR URL or log location (`https://github.com/repro-dev/repro/pull/<number>`)
3. **What to do** — specific commands to run locally (`moon ci :build :typecheck :test`, `prettier --write`, rebase steps) and the contract for completion (commit with Conventional Commit, push)

Example:

```
CI on PR #1134 (REP-1326 - upload progress overlay) has 'Build, check & test' failing.
Lint and format pass. Pull the failure logs from https://github.com/repro-dev/repro/pull/1134,
reproduce with `moon ci :build :typecheck :test` in affected packages, fix, commit with
Conventional Commit, and push.
```

### Sending to multiple sessions in parallel

Launch all injections in parallel tool calls — each is independent. Use one `bash` call per target with `herdr agent prompt`.

### Post-injection follow-up

After injecting, verify the session received it:

```sh
herdr agent read <target> --lines 5
```

Then optionally wait for completion:

```sh
herdr agent wait <target> --status idle --timeout 600000
```

## Recipes and playbooks

### 1. PR CI triage sweep

**Goal**: find all open PRs with CI failures, inject fix-instructions into their OpenCode sessions.

**Steps**:
1. `gh pr list --state open --limit 50` — get all open PRs
2. For each PR, `gh pr view <num> --json title,statusCheckRollup,mergeable,reviews` — extract CI status
3. `herdr workspace list` — cross-reference worktree paths with branch names to find workspaces
4. `herdr pane list --workspace <id>` — confirm OpenCode pane exists and is idle
5. Inject fix instructions into each idle session with failing CI
6. Skip PRs with green CI (only blocked on review)

**Skip conditions**: workspace not found, agent `working` (already busy), agent `blocked` (needs human intervention).

### 2. Broadcast announcement / rebase wave

**Goal**: tell every active OpenCode session to rebase onto main and fix conflicts.

**Steps**:
1. `herdr workspace list` — enumerate all workspaces
2. Filter to workspaces with `agent_status == "idle"` and `agent == "opencode"`
3. Inject: "Rebase this branch onto main, resolve any conflicts, run `moon ci :build :typecheck :test` to verify, commit if changes needed, and push."

### 3. Cross-workspace status dashboard

**Goal**: one-command snapshot of every OpenCode session's status, current task, and recent output.

```sh
# Build a table of workspace → status → last output line
for ws_id in $(herdr workspace list | jq -r '.result.workspaces[].workspace_id'); do
  label=$(herdr workspace get "$ws_id" | jq -r '.result.workspace.label')
  panes=$(herdr pane list --workspace "$ws_id")
  oc_pane=$(echo "$panes" | jq -r '.result.panes[] | select(.agent == "opencode") | .pane_id')
  status=$(echo "$panes" | jq -r --arg p "$oc_pane" '.result.panes[] | select(.pane_id == $p) | .agent_status')
  last_line=$(herdr agent read "$oc_pane" --source recent --lines 1 --format text 2>/dev/null | tail -1)
  echo "$label | $status | $last_line"
done
```

### 4. Post-merge cleanup sweep

**Goal**: after merging several PRs, tell those workspaces to clean up.

**Steps**:
1. Identify merged branches from `git branch -r --merged main`
2. Cross-reference with herdr workspaces by worktree path
3. Inject: "This branch has been merged. Close this session and remove the worktree with `reproctl wt remove <path>`."

### 5. Pre-release validation gate

**Goal**: before a release, verify all in-flight work is either merged or paused.

**Steps**:
1. `herdr workspace list` — enumerate all non-main workspaces
2. For each idle session, inject: "Pre-release freeze is in effect. If your PR is ready, push and request review. If not, add a comment to the PR with remaining work and status."
3. Compile a gate report: which PRs are ready, which are blocked, which need manual attention.

### 6. Dependency chain coordination

**Goal**: when PR A must merge before PR B, coordinate the sessions.

**Steps**:
1. Inject into session A: "PR #<num> is blocking downstream work. Prioritize CI fixes and push. PR URL: ..."
2. Wait for session A to go idle + CI green: `herdr agent wait <target-A> --status idle`
3. Check CI: `gh pr view <num-A> --json statusCheckRollup`
4. Inject into session B: "The blocking PR #<num-A> is now green. Rebase onto main once it merges, then push your changes."

### 7. Automated review dispatch

**Goal**: for PRs with green CI but no reviews, inject review-request context into a dedicated review session.

**Steps**:
1. `gh pr list --state open` — find PRs where `reviewDecision` is empty (no approvals)
2. Filter to those with all-green CI
3. Find or start a review-dedicated OpenCode session (`herdr agent start review-agent --cwd $REPO_ROOT -- ... opencode --prompt "/review <pr-number>"`)
4. Inject per-PR: "Review PR #<num> at https://github.com/repro-dev/repro/pull/<num>. Load `review-standards` skill, fetch the Linear issue, produce a structured review report."

### 8. Per-issue warmup / reattach

**Goal**: when starting a new issue, avoid creating a duplicate workspace if one already exists.

**Steps**:
1. Before `deliver REP-123`: `herdr workspace list | jq -r '.result.workspaces[] | select(.worktree.checkout_path | test("rep-123"))'`
2. If a workspace exists and is idle, inject the delivery command: `herdr agent prompt opencode-REP-123 "/build REP-123"`
3. If a workspace exists and is `working`, report to the user: "Session for REP-123 is already active"
4. If no workspace, proceed with `deliver REP-123`

### 9. Linter/formatter audit sweep

**Goal**: run a codebase-wide lint check, then fan out per-file fixes to idle sessions.

**Steps**:
1. Run `moon run :lint` across all packages, capture failing files
2. Group failures by package (each package is independent)
3. For each idle session with the right domain skill loaded, inject: "Fix oxlint/prettier violations in `<package>`. Files: `<list>`. Run `moon run :lint` to confirm, commit, push."
4. Each session owns one package's fix set; no coordination needed between them.

### 10. Agent status heartbeat monitor

**Goal**: periodic check that alerts when any session transitions to `blocked` and doesn't self-resolve.

**Implementation sketch** (for a cron or watch loop):
```sh
while true; do
  herdr workspace list | jq -r '
    .result.workspaces[]
    | select(.agent_status == "blocked")
    | "\(.label) is blocked — check \(.worktree.checkout_path // "workspace \(.workspace_id)")"
  '
  sleep 120
done
```

### 11. Cross-session test flake correlation

**Goal**: when the same test suite fails in multiple PRs, coordinate diagnosis across sessions.

**Steps**:
1. Compare CI failure patterns across PRs: `gh pr view <num> --json statusCheckRollup` for each
2. Identify shared failing check names or test output
3. Inject into all affected sessions: "Test `<suite>` is failing across PRs #<A>, #<B>, #<C>. Check if this is a shared dependency issue or infrastructure flake. CI logs at `<urls>`. If shared, coordinate the fix in one PR that the others can rebase onto."

### 12. Deliver wave orchestration

**Goal**: kick off multiple `deliver` calls in parallel, track all sessions, fan out shared context.

**Steps**:
1. For each issue in the wave, call `deliver REP-<n>` (these create worktrees and launch agents)
2. Wait for all agents to reach `idle` (initial bootstrap + exploration done):
   ```sh
   for target in opencode-REP-A opencode-REP-B opencode-REP-C; do
     herdr agent wait "$target" --status idle --timeout 300000 &
   done
   wait
   ```
3. Inject shared context (test plan, architecture notes, dependency ordering) into each session
4. Monitor with the status dashboard (recipe 3) until all reach `done`

## Reference: herdr command quick reference

| Command | Purpose |
|---|---|
| `herdr workspace list` | List all workspaces, statuses, worktree paths |
| `herdr workspace get <id>` | Detailed workspace info |
| `herdr pane list --workspace <id>` | List panes in a workspace |
| `herdr pane process-info --pane <id>` | Process details for a pane |
| `herdr agent list` | List all detected agents |
| `herdr agent get <target>` | Agent details |
| `herdr agent read <target>` | Read agent output |
| `herdr agent prompt <target> <text> [--wait]` | Send text + Enter to agent (v0.7.5+ replacement for `agent send`) |
| `herdr agent wait <target> --status idle` | Block until agent is idle |
| `herdr agent start <name> --kind KIND --pane ID` | Launch a new agent in an existing pane |
| `herdr pane send-keys <pane_id> enter` | Send Enter key to a pane |
| `herdr pane run <pane_id> <cmd>` | Send command + Enter (shell panes only) |
| `herdr pane split --pane ID --direction right\|down --ratio F` | Split a pane (used by deliver for layout). **`--ratio` sizes the split node's FIRST (original) pane** — on a right split the original stays left at ratio%, the new pane gets the remainder. deliver uses `--ratio 0.7` so opencode (left) gets 70% and terminal (right) 30%. |
| `herdr pane read <pane_id>` | Read raw pane output |
| `herdr api snapshot` | Full server state snapshot |
