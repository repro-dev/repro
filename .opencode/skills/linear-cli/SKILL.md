---
name: linear-cli
description: OpenCode guidance for the Linear CLI port of the Claude Code skill. Load when a command or workflow needs Linear data without MCP.
---

# Linear CLI

Use the repo-owned `linear` command when OpenCode needs Linear data or Linear mutations. Do not use MCP transports or any alternate Linear wrapper.

## Setup

- Install: `pnpm install`
- Configure credentials via `LINEAR_API_KEY` / `LINEAR_TEAM`, local `.linear`, or `~/.linear`
- Verify: `command -v linear && command -v jq && linear whoami`

The repo's `.envrc` adds `bin/` to `PATH`, so the checked-in `bin/linear` wrapper is available in repo shells.
The repo's `Brewfile` installs `jq` for trimming high-volume JSON responses during scans.

## Common commands

- List backlog work: `linear issues --status backlog --status todo --unblocked --leaf --limit 250`
- Create an issue: `linear issue create --title "..." --project "Workspace" --description "..." --label "Feature" --priority high`
- Create linked issues: `linear issue create --title "..." --project "Workspace" --parent ISSUE-1 --related ISSUE-2 --blocks ISSUE-3 --blocked-by ISSUE-4`
- Show an issue: `linear issue show ISSUE-1`
- Show child issues: `linear issue children ISSUE-1`
- Start work: `linear issue start ISSUE-1`
- Update issue fields: `linear issue update ISSUE-1 --title "Tracker: Workspace" --status "In Review" --description "..." --label "Feature" --add-label "needs-spec" --remove-label "Bug" --project "Workspace" --milestone "Sprint 1" --priority high --assignee "test@example.com"`
- Assign to self: `linear issue update ISSUE-1 --mine`
- Reparent an issue: `linear issue update ISSUE-2 --parent ISSUE-1`
- Remove a parent: `linear issue update ISSUE-2 --remove-parent`
- Add a comment: `linear issue comment ISSUE-1 "needs follow-up"`
- List labels: `linear label list`
- Create a label: `linear label create --name "needs-spec" --description "Issue requires additional specification" --color "#F2994A"`
- List projects: `linear projects`
- Show a project: `linear project show "Workspace"`
- Show milestones: `linear milestones --project "Workspace"`
- Show issue details as JSON: `linear issue show ISSUE-1 --json`
- Verify issue relations: `linear issue show ISSUE-1 --json | jq '.item.relations'`

## Usage notes

- Prefer JSON output when scripting or when the command supports it.
- Use the repo-owned CLI as the source of truth for all Linear work in this repo.
- Keep OpenCode prompts aligned with concrete CLI commands rather than abstract tool names.
- `linear issue create` accepts `--parent <issue-id>` for tracker/sub-issue setup.
- `linear issue update` accepts `--title <title>` for renaming and `--parent <issue-id>` / `--remove-parent` for reparenting.
- When creating or updating issue bodies, pass the body through a single-quoted heredoc so Markdown, backticks, and other code spans survive unchanged. Example: `linear issue create ... --description "$(cat <<'EOF'\n## Context\n...\nEOF\n)"`.
- Use raw `--json` for single-issue deep reads when you need full descriptions, comments, relations, or labels.
- Use `--json | jq '...'` for list and scan flows where only routing fields are needed; keep the projection stable and narrow.
- `linear issue list` supports `--unblocked` and `--leaf` for server-side narrowing of backlog scans, and accepts `--limit` up to 250.
- The current CLI surface is: `whoami`, `issue list`, `issue create`, `issue show`, `issue children`, `issue start`, `issue update`, `issue comment`, `label list`, `label create`, `project list`, `project show`, `milestone list`.
- Canonical projections:
  - Issue lists: `linear issue list --status backlog --json | jq '[.items[] | {id, identifier, title, state, priority, project}]'`
  - Label lists: `linear label list --json | jq '[.items[] | {id, name, color}]'`
- If a workflow needs a missing subcommand, stop and report the gap so the repo-owned CLI can be extended. Do not fall back to MCP or the legacy third-party CLI.
