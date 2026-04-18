---
name: linear-cli
description: OpenCode guidance for the Linear CLI port of the Claude Code skill. Load when a command or workflow needs Linear data without MCP.
---

# Linear CLI

Use the `linear` command from `@dabble/linear-cli` when OpenCode needs to work with Linear without MCP.

## Setup

- Install: `pnpm install`
- Authenticate: `linear login`
- Verify: `command -v linear && linear whoami`

The repo's `.envrc` adds `node_modules/.bin` so the workspace-local `linear` binary is available in repo shells after install.

## Common commands

- List ready work: `linear issues --unblocked`
- List backlog work: `linear issues --status backlog --status todo`
- Show an issue: `linear issue show ISSUE-1`
- Update an issue: `linear issue update ISSUE-1 --append "..."`
- Add a comment: `linear issue comment ISSUE-1 "..."`
- List projects: `linear projects`
- Show a project: `linear project show "Workspace"`
- Show milestones: `linear milestones --project "Workspace"`
- Pick the next issue: `linear next`
- Mark work done: `linear done ISSUE-1`

## Usage notes

- Prefer JSON output when scripting or when the command supports it.
- Use the CLI as the source of truth for issue/project lookup when MCP is disabled.
- Keep the OpenCode prompts aligned with CLI commands rather than MCP tool names.
