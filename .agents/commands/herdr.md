---
description: Cross-workspace orchestration — sweep PRs for CI failures, rebase waves, status dashboards, post-merge cleanup, and release gates
---

Arguments: `$ARGUMENTS`

## Argument parsing

1. If `$ARGUMENTS` is empty or whitespace-only, print usage and exit:

   ```
   Usage:
     /herdr <subcommand> [options]

   Cross-workspace orchestration over herdr and OpenCode sessions.

   Subcommands:
     sweep               PR CI triage — inject fix instructions into idle
                         sessions with failing CI
     rebase              Broadcast a rebase-onto-main instruction to every
                         idle OpenCode session
     dashboard           Cross-workspace status snapshot (label, status,
                         last output line)
     cleanup             Post-merge cleanup — tell merged-branch
                         workspaces to remove themselves
     gate                Pre-release validation gate — check all in-flight
                         work, inject freeze notice

   Examples:
     /herdr sweep
     /herdr rebase
     /herdr dashboard
     /herdr cleanup
   ```

2. Parse `$ARGUMENTS`:
   - First token is the subcommand: `sweep`, `rebase`, `dashboard`, `cleanup`, or `gate`
   - Any unrecognized subcommand → print "Error: unknown subcommand '<value>'" and the usage text, then exit

3. If the subcommand is `sweep` and additional options are present, accept:
   - `--pr <N>` — sweep only a single PR
   - `--dry-run` — discover and report without injecting

## Dispatch

1. Load `herdr-orchestration`.
2. Hand off to the matching playbook in the skill. Do not re-implement the playbook logic here.
3. After the playbook completes, report: which sessions were poked, which were skipped (and why — `working`, `blocked`, no workspace found), and what the user should do next.
