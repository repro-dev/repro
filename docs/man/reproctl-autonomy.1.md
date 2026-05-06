% REPROCTL-AUTONOMY(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-autonomy - durable local claim, status, and control state

# SYNOPSIS

**reproctl autonomy** *subcommand* [*options*]

# DESCRIPTION

Manage durable local state for autonomous orchestration.

The autonomy surface records local claims, active runs, retry metadata, and
Linear sync state for operator workflows. It does not provide a web UI.

# SUBCOMMANDS

**status** [**--all**] [**--json**]
: Show current claims and runs. With **--json**, emits a machine-readable status object.

**release** *issue* [**--reason** *text*] [**--json**]
: Release a local claim so it can be picked up again.

**cancel** *issue* [**--reason** *text*] [**--json**]
: Mark a claim canceled locally and sync the issue out of active work.

**retry** *issue* [**--phase** *observe*] [**--claimed-by** *name*] [**--reason** *text*] [**--json**]
: Reset retryable local state and re-prepare the issue.

**reconcile** [*issue* | **--all**]
: Refresh local claims from Linear issue state.

**discover** [**--limit** *count*] [**--profile** *name*] [**--prompt-file** *path*] [**--output-dir** *path*] [**--claimed-by** *name*] [**--project** *name*] [**--json**]
: Build a discovery wave, run OpenCode, and write durable discovery artifacts.

**run start** *issue* **--phase** *phase* **--workspace** *path*
: Start a durable run attempt.

**run finish** *issue* **--attempt** *n* **--state** *state* [**--error** *text*]
: Finish a run attempt and capture any failure message.

# OPTIONS

**--all**
: Include released and canceled claims in status output.

**--reason** *text*
: Explain why a claim was released, canceled, or retried.

**--phase** *phase*
: Set the preparation phase for retry and run commands.

**--claimed-by** *name*
: Tag local claim ownership with an operator name.

**--profile** *name*
: Pass a specific OpenCode profile to the launcher.

**--prompt-file** *path*
: Use an alternate discovery prompt template.

**--output-dir** *path*
: Override the discovery artifact directory.

**--project** *name*
: Restrict discovery to a Linear project.

**--json**
: Emit machine-readable JSON instead of a short text summary.

# EXAMPLES

reproctl autonomy status --json
: Inspect claims, runs, retry state, and recent sync errors.

reproctl autonomy retry REP-123 --phase observe --claimed-by autopilot
: Rebuild a stale claim and resume work.

# SEE ALSO

**reproctl**(1), **reproctl-opencode**(1)
