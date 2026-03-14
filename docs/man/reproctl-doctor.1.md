% REPROCTL-DOCTOR(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-doctor - diagnose the development environment

# SYNOPSIS

**reproctl** [**--json**] **doctor**

# DESCRIPTION

Runs a series of health checks against the local development environment and reports pass, warn, or fail for each item.

With the global **--json** flag, outputs a JSON object with an **items** array where each item has **name**, **status** (ok, warn, or fail), and optional **expected**, **actual**, and **message** fields.

The following checks are performed:

- **brew** — Homebrew is installed and functional.
- **direnv** — direnv is installed and hooked into the shell.
- **kind** — kind CLI is available.
- **pandoc** — pandoc document converter is available (used for manpage generation).
- **postgresql@17** — PostgreSQL 17 client tools are on PATH.
- **proto** — proto toolchain manager is installed.
- **node** — Node.js is available at the expected version.
- **pnpm** — pnpm package manager is available.
- **moon** — moon build tool is available.
- **tilt** — Tilt is installed.
- **helm** — Helm is installed.
- **ctlptl** — ctlptl is installed.
- **docker** — Docker daemon is running.
- **cluster** — The kind cluster exists and is reachable.
- **registry** — The local container registry is running.
- **pnpm install** — Node modules are up to date.
- **.envrc** — The .envrc file is trusted by direnv.

# EXIT STATUS

**0**
: All checks pass. Warnings are acceptable.

**1**
: One or more checks failed.

# EXAMPLES

reproctl doctor
: Run all health checks.

reproctl --json doctor
: Output health checks as JSON.

# SEE ALSO

**reproctl**(1), **reproctl-setup**(1)
