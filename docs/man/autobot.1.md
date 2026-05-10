% AUTOBOT(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

autobot - public queue interface for queued work items

# SYNOPSIS

**autobot** _subcommand_ [*options*]

# DESCRIPTION

Autobot is the repo-owned public queue CLI for work items. It uses queue/item
language rather than internal claim/run terminology and is intended to be run
from the main checkout.

The queue is managed locally and the standalone engine performs work item
handoff from queued to prepared delivery state.

JSON responses are versioned with `schema_version: 1`. Public status-oriented
commands also include a `config` block sourced from `.autobot/config.json`.
Current config keys include `engine.auto-discover`, `engine.queue-depth`, and
`engine.max-concurrency`.

# SUBCOMMANDS

**add** _issue_ [**--json**] [**--dry-run**]
: Queue an issue for delivery without creating a worktree.

**remove** _issue_ [**-f**] [**--json**] [**--dry-run**]
: Remove a queued item and restore its Linear assignment/state where possible.

**list** [**--json**]
: Show non-terminal queued items.

**status** [*_issue_*] [**--json**]
: Show queue summary, or a single item when an issue identifier is supplied.

**logs** [*_issue_*] [**-t**] [**--json**]
: Inspect engine or issue logs.

**discover** [**--limit** *N*] [**--project** *name*] [**-q**] [**--json**]
: Reuse the discovery pipeline and print queued issue identifiers.

**config get** _key_ [**--json**]
: Read a repo-scoped Autobot setting.

**config set** _key_ _value_ [**--json**]
: Persist a repo-scoped Autobot setting.

**config unset** _key_ [**--json**]
: Remove a repo-scoped Autobot setting override.

# OPTIONS

**--json**
: Emit machine-readable JSON instead of human text.

**--dry-run**
: Show the action without mutating local state or Linear.

**-f**
: Force removal of in-flight work.

**-q**
: Print only issue identifiers, one per line.

# EXAMPLES

autobot add REP-123
: Queue a work item.

autobot list --json
: Inspect the current queue as JSON.

autobot discover -q | xargs autobot add
: Pipe discovered work directly into the queue.

autobot config set engine.auto-discover on
: Enable engine-driven intake for the current repository.

# SEE ALSO

**reproctl-autonomy**(1), **reproctl**(1)
