% REPROCTL(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl - unified CLI for local development with Tilt, kind, and git worktrees

# SYNOPSIS

**reproctl** [**--json**] *command* [*args*...]

# DESCRIPTION

reproctl manages the local development environment for the Repro monorepo. It handles cluster lifecycle, service orchestration via Tilt, database operations, git worktree management, and log streaming.

Context is detected automatically: from the main checkout, services run as main; from a worktree, services are isolated to that branch.

# GLOBAL OPTIONS

**--json**
: Output machine-readable JSON instead of human-readable text. Supported by: **checkhealth**, **cluster status**, **context**, **db status**, **doctor**, **logs**, **status**, **wt list**.

# COMMANDS

## Environment

**setup**
: Bootstrap the development environment. See **reproctl-setup**(1).

**doctor**
: Diagnose the development environment. See **reproctl-doctor**(1).

**checkhealth** [**--json**]
: Runtime health checks (Tilt, k8s, services).

## Services

**start** *service* [*service*...]
: Start services from the current context. See **reproctl-start**(1).

**stop** [*service*...] | **--all**
: Stop services or tear down Tilt. See **reproctl-stop**(1).

**restart** *service* [*service*...] | **--all**
: Rebuild services or restart the Tilt daemon. See **reproctl-restart**(1).

**status**
: Show running services and Tilt dashboard URL. With **--json**, outputs a JSON object with Tilt state and a list of resource objects.

**logs** [*options*] [*service*...]
: Show or stream service logs. See **reproctl-logs**(1).

**ui**
: Open the Tilt dashboard in a browser.

**launch** *service*
: Open a service URL in the browser.

## Infrastructure

**cluster** *subcommand*
: Manage the local kind cluster. See **reproctl-cluster**(1).

**db** *subcommand*
: Database operations. See **reproctl-db**(1).

## Worktrees

**wt create** *branch*
: Create a new worktree for a branch.

**wt create --from-issue** *id*
: Create a worktree from a Linear issue.

**wt remove** *branch*
: Remove the worktree for a branch. See **reproctl-worktree**(1).

**wt list** [**--json**]
: List active worktrees.

**wt attach** *branch*
: Drop into a worktree subshell.

**wt prune** [**--yes**]
: Remove worktrees whose branches are merged.

## General

**context**
: Show the current development context (worktree, branch, issue, delta vs main, services). With **--json**, outputs a JSON object with context fields.

**help** [*command*]
: Show manpage for reproctl or a subcommand.

**completion** *shell*
: Generate shell completion scripts. See **reproctl-completion**(1).

# EXAMPLES

reproctl setup
: Bootstrap the entire environment.

reproctl start api-server workspace
: Start api-server and workspace from main checkout.

reproctl stop --all
: Tear down all services and Tilt.

# SHELL COMPLETION

Shell completions can be generated via the **completion** subcommand:

    reproctl completion bash
    reproctl completion zsh
    reproctl completion fish

See **reproctl-completion**(1) for installation instructions.

Completions are also available as static files in **scripts/completions/**
for direct sourcing via **.envrc** or shell profiles.

# INTERACTIVE PICKER

Commands that accept a service name (**start**, **stop**, **restart**, **logs**) support a **--pick** / **-p** flag to interactively select from available services. If **fzf** is installed, it is used for fuzzy selection; otherwise a numbered prompt is shown.

For **worktree attach** and **worktree remove**, omitting the branch argument triggers the picker automatically when stdin is a terminal.

# SEE ALSO

**reproctl-setup**(1), **reproctl-doctor**(1), **reproctl-cluster**(1), **reproctl-db**(1), **reproctl-start**(1), **reproctl-stop**(1), **reproctl-restart**(1), **reproctl-logs**(1), **reproctl-worktree**(1), **reproctl-completion**(1)
