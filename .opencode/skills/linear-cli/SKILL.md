---
name: linear-cli
description: OpenCode guidance for the Linear CLI port of the Claude Code skill. Load when a command or workflow needs Linear data without MCP.
---

# Linear CLI

Use the repo-owned `linear` command when OpenCode needs Linear data or Linear mutations. Do not use MCP transports or any alternate Linear wrapper.

## Setup

- Install: `pnpm install`
- Configure credentials via `LINEAR_API_KEY` / `LINEAR_TEAM`, local `.linear`, or `~/.linear`
- Verify: `command -v linear && linear whoami`

The repo's `.envrc` adds `bin/` to `PATH`, so the checked-in `bin/linear` wrapper is available in repo shells.

## Common commands

- List backlog work: `linear issues --status backlog --status todo`
- Show an issue: `linear issue show ISSUE-1`
- List projects: `linear projects`
- Show a project: `linear project show "Workspace"`
- Show milestones: `linear milestones --project "Workspace"`
- Show issue details as JSON: `linear issue show ISSUE-1 --json`

## Usage notes

- Prefer JSON output when scripting or when the command supports it.
- Use the repo-owned CLI as the source of truth for all Linear work in this repo.
- Keep OpenCode prompts aligned with concrete CLI commands rather than abstract tool names.
- The current CLI surface is read-heavy: `whoami`, `issue list`, `issue show`, `project list`, `project show`, `milestone list`.
- If a workflow needs a missing subcommand, stop and report the gap so the repo-owned CLI can be extended. Do not fall back to MCP or the legacy third-party CLI.
