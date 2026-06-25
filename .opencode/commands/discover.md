---
description: Read-only Linear backlog scan — classify readiness, sequence by file independence, and write artifacts to tmp/discover-runs/
---

Arguments: `$ARGUMENTS`

## Argument parsing

1. If `$ARGUMENTS` is empty or whitespace-only, print usage and exit:

   ```
   Usage:
     /discover --project <project> [--query <term>]

   Scans Todo and Backlog issues in a Linear project, classifies readiness,
   sequences candidates into waves by file independence, and writes output
   to tmp/discover-runs/<run-id>/.

   --project <project>  (required) Linear project name
   --query <term>       (optional) Filter ready candidates by keyword
   ```

2. Parse `$ARGUMENTS` with a simple state-machine split:

   - `--project <value>` → store as `target_project`
   - `--query <value>` → store as `search_query`
   - Any other flag (`--*`) or bare positional argument → print usage error and exit

3. If `target_project` is missing or empty, print:

   ```
   Error: --project is required.
   ```

   and exit.

## Dispatch

1. Load `linear-cli` and the `discover` skill.
2. Hand off execution to the `discover` skill's workflow with `target_project` and optional `search_query`.
3. Do not re-implement the discovery workflow here — the skill owns the operating logic.
