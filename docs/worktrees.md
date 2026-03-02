# Worktree Development Guide

## Overview

Git worktrees let you check out multiple branches of the same repository simultaneously, each in its own directory. The Repro project uses worktrees so that developers (and agents) can work on multiple features in parallel without switching branches, while running fully isolated services against a shared local cluster.

Key properties:

- Each worktree is a full working copy sharing a single `.git` object store.
- Services started from a worktree get unique Tilt resource names and hostnames so they do not collide with services from the main checkout or other worktrees.
- Shared infrastructure (database, object storage, ingress controller) is provisioned once and reused by all worktrees.

## Prerequisites

| Tool | Purpose |
|------|---------|
| **kind** | Local Kubernetes cluster |
| **Tilt** | Service orchestration and live-reload |
| **pnpm** | Package management |
| **direnv** | Per-directory environment variables |
| **Helm** | Kubernetes templating (used internally by Tilt) |
| **Docker** | Container builds for k8s services |

Run `reproctl doctor` to verify your environment.

## Quick start

```bash
# 1. Create the worktree (installs deps, copies .env files, allows direnv)
reproctl wt create feat/my-feature

# 2. Change into the worktree
cd ~/Projects/repro-dev/repro-wt-feat-my-feature

# 3. Start an isolated service
reproctl start api-server

# 4. Verify it's running
reproctl status

# 5. Open the worktree's API in a browser
open http://api.wt-feat-my-feature.repro.localhost
```

## Architecture

### Parent-orchestrator pattern

A single Tilt process, launched from the main checkout's `infra/` directory, orchestrates all services across every worktree. There is no per-worktree Tilt instance.

```
~/Projects/repro-dev/
  repro/                          # main checkout
    infra/
      Tiltfile                    # single orchestrator
    tmp/
      reproctl_services.json      # shared service registry
      tilt.pid
      tilt.log
  repro-wt-feat-my-feature/       # worktree
  repro-wt-fix-login-bug/         # another worktree
```

### How it works

1. Running `reproctl start <service>` from any checkout writes an entry to `tmp/reproctl_services.json` in the **main checkout**. Each entry records the service name, source path, and worktree slug.

2. The Tiltfile watches `reproctl_services.json`. When the file changes, Tilt re-evaluates and registers (or removes) services automatically.

3. Worktree services are registered with unique names and hostnames so they coexist with the main checkout and with each other.

```
 ┌─ Main checkout ────────────────────────┐
 │  reproctl start workspace              │
 │  → writes {name:"workspace", slug:""}  │
 └────────────────────┬───────────────────┘
                      │
                      ▼
          tmp/reproctl_services.json
                      │
                      ▼
 ┌─ Tilt (single process) ───────────────────────────────┐
 │                                                       │
 │  workspace             ← main checkout source         │
 │  api-server            ← auto-resolved dependency     │
 │  api-server-wt-feat-x  ← worktree source              │
 │  gateway-ingress-wt-feat-x                            │
 │  database, storage      ← shared infra (always once)  │
 └───────────────────────────────────────────────────────┘
                      ▲
 ┌─ Worktree ─────────┴───────────────────┐
 │  reproctl start api-server             │
 │  → writes {name:"api-server",          │
 │            slug:"feat-x",              │
 │            source:"/path/to/wt"}       │
 └────────────────────────────────────────┘
```

### Resource naming

| Context | Tilt resource name | Hostname |
|---------|-------------------|----------|
| Main checkout | `api-server` | `api.repro.localhost` |
| Worktree `feat-x` | `api-server-wt-feat-x` | `api.wt-feat-x.repro.localhost` |
| Worktree `feat-x` | `workspace-wt-feat-x` | `app.wt-feat-x.repro.localhost` |

The slug is derived from the worktree directory name. A worktree at `repro-wt-feat-my-feature` has slug `feat-my-feature`. Branch slashes are replaced with hyphens (`feat/my-feature` becomes `feat-my-feature`).

### Dependency resolution

When you start a service that has dependencies (defined in `infra/services.json`), the orchestrator automatically starts the missing dependencies from the **main checkout**. For example, starting `workspace` from a worktree also starts `api-server` from main if no `api-server` is already running.

## CLI reference

All commands are invoked via `reproctl`. The `worktree` subcommand can be abbreviated to `wt`.

### Worktree lifecycle

| Command | Description |
|---------|-------------|
| `reproctl wt create <branch>` | Create a worktree, run `pnpm install`, copy `.env` files, allow direnv. Auto-creates the branch if it does not exist. |
| `reproctl wt remove <branch>` | Remove the worktree directory and prune git metadata. |
| `reproctl wt list` | List all active worktrees with their branches. |
| `reproctl wt attach <branch>` | Open a subshell inside the worktree with `REPRO_WORKTREE` env vars set. Exit the shell to return. |

Both `create` and `remove` accept `--dry-run` to preview actions without making changes.

### Service management

| Command | Description |
|---------|-------------|
| `reproctl start <service> [...]` | Register services in `reproctl_services.json` and start Tilt if not running. Context-aware: detects worktree automatically. |
| `reproctl stop <service> [...]` | Remove specific services from the registry. Tilt reloads. |
| `reproctl stop --all` | Tear down Tilt entirely and remove the config file. |
| `reproctl restart <service> [...]` | Trigger a rebuild and redeploy of running services via `tilt trigger`. |
| `reproctl status` | Show Tilt status and all running resources with their state. |
| `reproctl logs [-f] [service]` | Show or stream logs. Use `-f` for follow mode. |
| `reproctl ui` | Open the Tilt dashboard in a browser. |

### Infrastructure

| Command | Description |
|---------|-------------|
| `reproctl setup` | Bootstrap the full development environment. |
| `reproctl doctor` | Diagnose the development environment. |
| `reproctl cluster up\|down\|status\|reset` | Manage the local kind cluster. |
| `reproctl db reset\|migrate\|shell\|status` | Database operations (shared across all worktrees). |

## Service isolation

### What is isolated

Each worktree gets its own:

- **Docker images** -- built from the worktree's source tree.
- **Kubernetes deployments** -- namespaced with the `-wt-<slug>` suffix.
- **Ingress routes** -- a per-worktree gateway maps `*.wt-<slug>.repro.localhost` to the worktree's services.
- **Local processes** -- for `local` service types (like `capture` and `dev-toolbar`), the watch command runs against the worktree's source directory.

### What is shared

These are singletons, provisioned once regardless of how many worktrees are active:

- **Database** (PostgreSQL)
- **Object storage** (SeaweedFS)
- **Ingress controller** (nginx-ingress)

All worktree services connect to the same database and storage. This means data is shared. If you need data isolation, use different database schemas or test accounts.

### Fallback routing

When a worktree only isolates some services, the per-worktree ingress falls back to the main checkout's services for everything else. For example, if you isolate `api-server` in worktree `feat-x`:

- `api.wt-feat-x.repro.localhost` routes to `api-server-wt-feat-x-service`
- `app.wt-feat-x.repro.localhost` routes to the main checkout's `workspace-service`

This means you only need to rebuild the services you are actually changing.

### Service types

Services are defined in `infra/services.json`. Each service has a type that determines how it is deployed:

| Type | Examples | Deployment |
|------|----------|------------|
| `k8s` (default) | `api-server`, `workspace` | Docker build, Helm chart, k8s deployment |
| `local` | `capture`, `dev-toolbar` | Local process via `moon run <project>:watch` |

## End-to-end walkthrough

This walkthrough demonstrates the full workflow: picking up a feature, developing in an isolated worktree, testing, creating a PR, and cleaning up.

### 1. Pick up the issue

You have been assigned REP-999 to add a new API endpoint.

### 2. Create the worktree

```bash
reproctl wt create feat/rep-999-new-endpoint
```

This will:

- Create `~/Projects/repro-dev/repro-wt-feat-rep-999-new-endpoint/`
- Check out (or create) the `feat/rep-999-new-endpoint` branch
- Run `pnpm install`
- Copy `.env` files from the main checkout
- Allow direnv if configured

### 3. Navigate to the worktree

```bash
cd ~/Projects/repro-dev/repro-wt-feat-rep-999-new-endpoint
```

Or use the attach subshell:

```bash
reproctl wt attach feat/rep-999-new-endpoint
```

### 4. Make your changes

Edit the code as usual. You are on a normal git branch, so all standard git operations work.

```bash
# Edit source files
$EDITOR apps/api-server/src/routes/new-endpoint.ts

# Typecheck
moon run repro/api-server:typecheck
```

### 5. Start the isolated service

```bash
reproctl start api-server
```

This registers `api-server` with slug `feat-rep-999-new-endpoint` in the shared config. Tilt picks it up and:

- Builds a Docker image from the worktree's source
- Deploys it as `api-server-wt-feat-rep-999-new-endpoint`
- Creates an ingress at `api.wt-feat-rep-999-new-endpoint.repro.localhost`

If `api-server` depends on shared infra (database, storage), those are started automatically if not already running.

### 6. Verify

```bash
# Check resource status
reproctl status

# Test the endpoint
curl http://api.wt-feat-rep-999-new-endpoint.repro.localhost/new-endpoint

# Stream logs
reproctl logs -f api-server
```

Live-reload is active for source changes. Edits to `apps/api-server/src/` are synced into the running container without a full rebuild.

### 7. Run tests and format

```bash
moon run repro/api-server:typecheck
pnpm fmt
```

### 8. Commit and push

```bash
git add -A
git commit -m "feat(api): add new endpoint (REP-999)"
git push -u origin feat/rep-999-new-endpoint
```

### 9. Create the pull request

```bash
gh pr create --title "feat(api): add new endpoint (REP-999)" --body "$(cat <<'EOF'
## Summary

Add the /new-endpoint route to api-server.

## Linear Issue

Resolves REP-999

## Changes

- Added new endpoint handler and route registration
- Added request validation schema

## Verification

- [x] Typechecks pass (`moon run repro/api-server:typecheck`)
- [x] Formatted with `pnpm fmt`
EOF
)"
```

### 10. Clean up

Once the PR is merged:

```bash
# Stop the isolated service
reproctl stop api-server

# Remove the worktree
reproctl wt remove feat/rep-999-new-endpoint
```

## Troubleshooting

### Stale worktrees

If a worktree directory was deleted manually (rather than via `reproctl wt remove`), git may report errors about missing worktrees.

```bash
# From the main checkout:
git worktree prune
```

### Git lock contention

When multiple worktrees perform git operations simultaneously, you may see `.git/index.lock` errors. This is rare but can happen during concurrent rebases or checkouts. Wait and retry, or remove the stale lock file:

```bash
rm ~/Projects/repro-dev/repro/.git/index.lock
```

### pnpm install failures

Each worktree has its own `node_modules`. If `pnpm install` fails during worktree creation:

```bash
cd ~/Projects/repro-dev/repro-wt-<slug>
rm -rf node_modules
pnpm install
```

### Service not appearing in Tilt

1. Verify the config file was updated:

   ```bash
   cat ~/Projects/repro-dev/repro/tmp/reproctl_services.json
   ```

2. Confirm Tilt is running:

   ```bash
   reproctl status
   ```

3. Check Tilt logs for errors:

   ```bash
   cat ~/Projects/repro-dev/repro/tmp/tilt.log
   ```

4. Force a Tilt reload by touching the config file:

   ```bash
   touch ~/Projects/repro-dev/repro/tmp/reproctl_services.json
   ```

### Port conflicts

The Tilt dashboard defaults to port 10350. If another process is using it, set a custom port:

```bash
export TILT_PORT=10351
reproctl start api-server
```

### Worktree hostnames not resolving

All `*.repro.localhost` hostnames resolve to `127.0.0.1` by default (RFC 6761). If they do not resolve in your environment, add entries to `/etc/hosts`:

```
127.0.0.1  api.wt-feat-x.repro.localhost
127.0.0.1  app.wt-feat-x.repro.localhost
```

### Database is shared

All worktrees connect to the same database instance. If your feature involves schema migrations, be aware that running migrations from one worktree affects all others. Coordinate with teammates when working on migration-heavy features simultaneously.
