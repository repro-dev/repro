% REPROCTL-HELP-JSON(7) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-help-json - JSON output conventions for reproctl commands

# DESCRIPTION

Several reproctl commands support a **--json** global flag that switches
output from human-readable text to machine-readable JSON. This page
documents the output conventions and schemas.

# CONVENTIONS

**List commands** return an object with an **items** array:

    { "items": [ ... ] }

**Single-object commands** return a top-level JSON object directly.

**Streaming exception**: **reproctl logs --json** outputs newline-delimited
JSON (NDJSON) — one JSON object per line — because log output is unbounded.

# SUPPORTED COMMANDS

**reproctl --json doctor**

:   Returns an object with an **items** array. Each item contains:

        {
          "items": [
            {
              "name": "node",
              "status": "ok",
              "expected": "26.4.0",
              "actual": "26.4.0"
            }
          ]
        }

**reproctl --json checkhealth**

:   Returns an object with an **items** array. Each item contains:

        {
          "items": [
            {
              "name": "tilt",
              "status": "ok",
              "message": "Tilt is running"
            }
          ]
        }

**reproctl --json status**

:   Returns an object describing Tilt state and running resources:

        {
          "tilt": { "running": true, "url": "http://localhost:10350" },
          "items": [
            {
              "name": "api-server",
              "status": "ok",
              "type": "k8s"
            }
          ]
        }

**reproctl --json context**

:   Returns a single object with context fields:

        {
          "worktree": "feat/REP-123-auth",
          "branch": "feat/REP-123-auth",
          "path": "/path/to/worktree",
          "issue": "REP-123",
          "main": false
        }

**reproctl --json wt list**

:   Returns an object with an **items** array of worktree objects:

        {
          "items": [
            {
              "branch": "feat/REP-123-auth",
              "path": "/path/to/worktree",
              "head": "abc1234"
            }
          ]
        }

**reproctl logs --json**

:   Outputs NDJSON (one object per line, not wrapped in an array):

        {"timestamp":"2026-01-15T10:30:00Z","service":"api-server","level":"info","message":"listening on :3000"}
        {"timestamp":"2026-01-15T10:30:01Z","service":"api-server","level":"info","message":"connected to database"}

# SEE ALSO

**reproctl**(1), **reproctl-help-environment**(7), **reproctl-help-exit-codes**(7)
