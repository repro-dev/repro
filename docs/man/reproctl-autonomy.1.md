% REPROCTL-AUTONOMY(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-autonomy - durable local claim, monitor, and sequencing state

# SYNOPSIS

**reproctl autonomy** *subcommand* [*options*]

# DESCRIPTION

Manage durable local state for autonomous orchestration.

The **sequence** subcommand asks OpenCode to rank candidate issues before
planning and execution. It uses monitor eligibility as the baseline, then
writes a durable prompt, raw response, and canonical JSON artifact set under
**tmp/autonomy/sequences/**.

The sequencing stage is intentionally narrower than the autonomous runner. It
does not launch agents, mutate Linear, or create worktrees.

# SUBCOMMANDS

**sequence** [**--limit** *count*] [**--profile** *name*] [**--prompt-file** *path*] [**--output-dir** *path*] [**--claimed-by** *name*] [**--json**]
: Build a candidate evaluation from the current backlog/todo issues, render a prompt, run OpenCode, and write durable sequencing artifacts. The default prompt lives at **scripts/lib/prompts/autonomy-sequence.md**.

# OPTIONS

**--limit** *count*
: Limit the candidate evaluation passed into sequencing.

**--profile** *name*
: Pass a specific OpenCode profile to the launcher.

**--prompt-file** *path*
: Use an alternate sequencing prompt template.

**--output-dir** *path*
: Override the sequencing artifact directory.

**--claimed-by** *name*
: Tag the candidate evaluation with the active operator name.

**--json**
: Emit the canonical sequencing JSON instead of a short text summary.

# EXAMPLES

reproctl autonomy sequence --limit 2 --profile github-copilot-sonnet --output-dir tmp/autonomy/sequences --json
: Generate a durable sequencing artifact set for the next planning wave.

# SEE ALSO

**reproctl**(1), **reproctl-opencode**(1)
