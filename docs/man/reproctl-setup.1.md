% REPROCTL-SETUP(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-setup - bootstrap the local development environment

# SYNOPSIS

**reproctl setup** [**--skip-cluster**]

# DESCRIPTION

Runs an 8-step bootstrap sequence to prepare the local development environment:

1. **brew bundle** — install Homebrew dependencies from the Brewfile.
2. **direnv check** — verify the direnv shell hook is active.
3. **proto use** — activate the correct toolchain versions.
4. **pnpm install** — install Node.js dependencies.
5. **Docker check** — verify Docker is running.
6. **direnv allow** — trust the `.envrc` file.
7. **.envrc.local** — write `.envrc.local` exporting `OPENCODE_CONFIG_CONTENT` as a machine-local overlay on top of the tracked root `opencode.json`. Shared repo requirements stay in the checked-in root config; this overlay only carries machine-specific permissions such as `permission.external_directory` scoped to the local checkout parent directory (covers all sibling worktrees). Loaded by direnv via `source_env_if_exists`. This file is gitignored and regenerated on every run.
8. **cluster up** — create the local kind cluster and container registry.

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
