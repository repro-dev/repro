% REPROCTL(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl - unified CLI for local development with Tilt, kind, and git worktrees

# SYNOPSIS

**reproctl** *command* [*args*...]

# DESCRIPTION

reproctl manages the local development environment for the Repro monorepo. It handles cluster lifecycle, service orchestration via Tilt, database operations, git worktree management, and log streaming.

Context is detected automatically: from the main checkout, services run as main; from a worktree, services are isolated to that branch.

# COMMANDS

**setup**
: Bootstrap the development environment. See **reproctl-setup**(1).

**doctor**
: Diagnose the development environment. See **reproctl-doctor**(1).

**cluster** *subcommand*
: Manage the local kind cluster. See **reproctl-cluster**(1).

**db** *subcommand*
: Database operations. See **reproctl-db**(1).

**start** *service* [*service*...]
: Start services from the current context. See **reproctl-start**(1).

**stop** [*service*...] | **--all**
: Stop services or tear down Tilt. See **reproctl-stop**(1).

**restart** *service* [*service*...] | **--all**
: Rebuild services or restart the Tilt daemon. See **reproctl-restart**(1).

**status**
: Show running services and Tilt dashboard URL.

**logs** [*options*] [*service*...]
: Show or stream service logs. See **reproctl-logs**(1).

**ui**
: Open the Tilt dashboard in a browser.

**worktree** *subcommand*
: Manage git worktrees. See **reproctl-worktree**(1). Alias: **wt**.

# EXAMPLES

reproctl setup
: Bootstrap the entire environment.

reproctl start api-server workspace
: Start api-server and workspace from main checkout.

reproctl stop --all
: Tear down all services and Tilt.

# SEE ALSO

**reproctl-setup**(1), **reproctl-doctor**(1), **reproctl-cluster**(1), **reproctl-db**(1), **reproctl-start**(1), **reproctl-stop**(1), **reproctl-restart**(1), **reproctl-logs**(1), **reproctl-worktree**(1)
