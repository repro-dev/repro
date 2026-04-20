---
name: command-thin-shim
description: Keep command files as lightweight argument parsers and dispatchers. Load when adding or refactoring OpenCode commands.
---

# Command Thin Shim

Use this skill when authoring `.opencode/commands/*.md` files.

## Rule

Command files should stay thin. They should parse `$ARGUMENTS`, validate mode selection, and dispatch into the skill or workflow that owns the actual operating logic.

## Good command responsibilities

- Describe the command contract.
- Parse flags and positional arguments.
- Validate mutually exclusive modes.
- Identify which skill or workflow to load.
- Define small command-specific output expectations.

## Avoid inside commands

- Repeating a large delivery workflow inline.
- Duplicating long checklists that already live in a skill.
- Embedding domain rules that belong in `AGENTS.md` or a reusable skill.

## Preferred pattern

```md
---
description: One-line command description
---

Arguments: `$ARGUMENTS`

1. Parse and validate arguments.
2. Load the owning skill.
3. Hand off execution to that skill's workflow.
4. Keep command-specific reporting brief.
```

## Migration guidance

- Do not rewrite a stable command into a thin shim unless the extraction clearly reduces duplication.
- For existing heavyweight commands, apply this rule incrementally when touching them for substantive work.
