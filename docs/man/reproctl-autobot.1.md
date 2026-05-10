% REPROCTL-AUTOBOT(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-autobot - durable local claim, status, and control state

# SYNOPSIS

**reproctl autobot** _subcommand_ [*options*]

# DESCRIPTION

Provisional repo-internal lifecycle plumbing for autobot orchestration.

The autobot surface records local claims, active runs, retry metadata, and
Linear sync state for operator workflows. It is the public user-facing
interface for autobot orchestration.

## Actor model

The claim queue is shared by three provisional actors:

- **User/operator** — inspects state, discovers work, and overrides lifecycle
  state when needed.
- **Bot-mode intake** — discovers and claims work up to policy and concurrency
  limits.
- **Delivery daemon** — operates only on already-claimed work and shepherds it
  through prepare, run, retry, reconcile, release, and cancel.

Commands are owned by the actor that mutates the relevant part of the
provisional contract. Discovery and claim are intake primitives; prepare and
run are daemon lifecycle primitives; release, cancel, retry, and reconcile are
daemon recovery or terminal controls with operator override use.

# SUBCOMMANDS

**status** [**--all**] [**--json**]
: Inspect claim and run state. With **--json**, emits a machine-readable status object.

**discover** [**--limit** *count*] [**--profile** *name*] [**--prompt-file** *path*] [**--output-dir** *path*] [**--claimed-by** *name*] [**--project** *name*] [**--json**]
: Intake discovery for user/operator and bot-mode.

**claim** _issue_ **--workspace** _path_ **--phase** _phase_ **--issue-state** _name_ [**--issue-state-type** *type*] [**--claimed-by** *user*]
: Intake claim primitive for user/operator and bot-mode.

**prepare** _issue_ [**--phase** *observe*] [**--claimed-by** *name*]
: Delivery daemon lifecycle primitive.

**release** _issue_ [**--reason** *text*] [**--json**]
: Delivery daemon recovery/terminal control; operator override use.

**cancel** _issue_ [**--reason** *text*] [**--json**]
: Delivery daemon recovery/terminal control; operator override use.

**retry** _issue_ [**--phase** *observe*] [**--claimed-by** *name*] [**--reason** *text*] [**--json**]
: Delivery daemon recovery/terminal control; operator override use.

**reconcile** [*issue* | **--all**]
: Delivery daemon recovery/terminal control; operator override use.

**run start** _issue_ **--phase** _phase_ **--workspace** _path_
: Delivery daemon lifecycle primitive.

**run finish** _issue_ **--attempt** _n_ **--state** _state_ [**--error** *text*]
: Delivery daemon lifecycle primitive.

# OPTIONS

**--all**
: Include released and canceled claims in status output.

**--reason** _text_
: Explain why a claim was released, canceled, or retried.

**--phase** _phase_
: Set the preparation phase for retry and run commands.

**--claimed-by** _name_
: Tag local claim ownership with an operator name.

**--profile** _name_
: Pass a specific OpenCode profile to the launcher.

**--prompt-file** _path_
: Use an alternate discovery prompt template.

**--output-dir** _path_
: Override the discovery artifact directory.

**--project** _name_
: Restrict discovery to a Linear project.

**--json**
: Emit machine-readable JSON instead of a short text summary.

# EXAMPLES

reproctl autobot status --json
: Inspect claims, runs, retry state, and recent sync errors.

reproctl autobot retry REP-123 --phase observe --claimed-by autopilot
: Rebuild a stale claim and resume work.

# SEE ALSO

**reproctl**(1), **reproctl-opencode**(1)
