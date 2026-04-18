% REPROCTL-SETUP(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-setup - bootstrap the local development environment

# SYNOPSIS

**reproctl setup** [**--skip-cluster**]

# DESCRIPTION

Runs a 9-step bootstrap sequence to prepare the local development environment:

1. **brew bundle** — install Homebrew dependencies from the Brewfile.
2. **agent-browser runtime** — verify the CLI is installed and provision the shared Chrome for Testing runtime with `agent-browser install` when needed.
3. **direnv check** — verify the direnv shell hook is active.
4. **proto use** — activate the correct toolchain versions.
5. **pnpm install** — install Node.js dependencies.
6. **Docker check** — verify Docker is running.
7. **direnv allow** — trust the `.envrc` file.
8. **.envrc.local** — write `.envrc.local` exporting `OPENCODE_CONFIG_CONTENT` with agent permissions scoped to the local checkout parent directory (covers all sibling worktrees). Loaded by direnv via `source_env_if_exists`. This file is gitignored and regenerated on every run.
9. **cluster up** — create the local kind cluster and container registry.

Each step is idempotent and safe to re-run.

Agent sessions assume the shared machine-local `agent-browser` CLI/runtime has already been provisioned by bootstrap. The supported checks and recovery path are `reproctl doctor` and `agent-browser doctor` (use `agent-browser doctor --fix` when needed).

# OPTIONS

**--skip-cluster**
: Skip step 9 (kind cluster creation). Useful when you only need to update dependencies without touching the cluster.

# EXAMPLES

reproctl setup
: Run the full bootstrap sequence.

reproctl setup --skip-cluster
: Bootstrap without creating the cluster.

# SEE ALSO

**reproctl**(1), **reproctl-doctor**(1), **reproctl-cluster**(1)
