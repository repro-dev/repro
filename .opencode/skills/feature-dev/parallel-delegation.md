# Parallel Delegation Playbook

End-to-end flow for working on multiple independent issues in parallel using Task tool subagents.

## 1. Create worktrees

From the main checkout, create one worktree per issue:

```sh
reproctl wt create --from-issue REP-101
reproctl wt create --from-issue REP-102
```

## 2. Spawn subagents

Use the Task tool to launch one subagent per worktree. Prefer the typed agents (`planner`, `develop`, `review`, `test`) over the generic `general` agent — they have purpose-built prompts, model routing, and tool restrictions.

Each Task prompt should contain exactly three things:

1. **Worktree path** (absolute) — the subagent's working directory
2. **Issue identifier** (e.g. `REP-101`) — so the subagent can fetch it via MCP
3. **Objective** — what to do and completion criteria

### Agent selection

| Phase | Agent | What it does |
|-------|-------|-------------|
| Planning | `planner` | Explores codebase, produces structured plan document |
| Implementation | `develop` | TDD implementation — writes tests, code, commits |
| Review | `review` | Read-only code review against issue requirements |
| Testing (standalone) | `test` | Coverage augmentation, regression tests, test audits |

### Prompt template (develop)

```
Implement the following in worktree /abs/path/to/repro-wt-...-rep-101:

<plan document from @planner>

1. Fetch Linear issue REP-101 and read the full description.
2. Load the `feature-dev` skill and follow Phases 3–5.
3. All file operations MUST use absolute paths under the worktree.
4. When done: commit with Conventional Commits referencing the issue.
```

The subagent self-primes by fetching the Linear issue via MCP (`Linear_get_issue`), loading skills, and reading `AGENTS.md` in affected packages. The orchestrator does not need to assemble or relay any of this context.

Launch all Task calls in a **single message** so they run concurrently.

## 3. Review and merge

After subagents complete:

1. Push branches and create PRs (if the subagent didn't already)
2. Spawn `@review` for each PR to get structured review feedback
3. If review finds blocking issues, re-spawn `@develop` with the original plan + review feedback
4. Post AI review as PR comment
5. Set Linear issues to In Review
6. After PRs merge, `git pull` on main triggers automatic worktree pruning

## Important notes

- **Git lock contention**: Subagents sharing `.git/` may hit lock errors on concurrent git operations. Stagger fetches, or set `gc.auto=0`. Subagents should retry on lock failures.
- **Independence requirement**: Only use this pattern for issues that touch different files. Overlapping changes will cause merge conflicts.
- **Step budget**: Subagents have a step limit. For large issues, break them into smaller sub-issues first.
- **Review loop cap**: Limit the review → develop → review cycle to 2 rounds. After that, escalate to the user.
