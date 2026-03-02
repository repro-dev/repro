% REPROCTL-SETUP(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-setup - bootstrap the local development environment

# SYNOPSIS

**reproctl setup** [**--skip-cluster**]

# DESCRIPTION

Runs a 5-step bootstrap sequence to prepare the local development environment:

1. **brew bundle** — install Homebrew dependencies from the Brewfile.
2. **proto use** — activate the correct toolchain versions.
3. **pnpm install** — install Node.js dependencies.
4. **Docker check** — verify Docker is running.
5. **cluster up** — create the local kind cluster and container registry.

Each step is idempotent and safe to re-run.

# OPTIONS

**--skip-cluster**
: Skip step 5 (kind cluster creation). Useful when you only need to update dependencies without touching the cluster.

# EXAMPLES

reproctl setup
: Run the full bootstrap sequence.

reproctl setup --skip-cluster
: Bootstrap without creating the cluster.

# SEE ALSO

**reproctl**(1), **reproctl-doctor**(1), **reproctl-cluster**(1)
