![Repro](assets/repro-logo-full.png)

The developer tool and browser extension to make bug reporting in the browser more collaborative and reproducible. Repro shortens the debugging cycle in web development and empowers teams to painlessly ship defect-free software to users. Built for high-performing product teams.

Get started here: https://repro.dev

---

![](assets/repro-promo-image.png)

## Why Use Repro?

Repro brings together powerful features that make reproducing and fixing bugs simple:

- **Session recording**: Rewind and replay bugs easily with instant session recording. Capture every click and key press.
- **Console logs & errors**: Replay logs, warnings and errors, with stack traces to understand when and why errors are thrown.
- **Network requests & responses**: Capture and review network requests, responses and headers.
- **DOM, styling & layout**: View changes to the DOM and styling over time, using a replayable element inspector.

Use Repro for faster debugging, better software and happier users!

## Local Development

### Prerequisites

- macOS (primary supported platform)
- [Homebrew](https://brew.sh)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be running)
- direnv shell hook (the bootstrap script will remind you if it's missing)
- `agent-browser` (installed and provisioned by bootstrap)

### First-time setup

```sh
# Clone the repository
git clone git@github.com:AnomalyInnovations/repro.git
cd repro

# Bootstrap everything in one shot:
#   brew deps → agent-browser runtime → proto tools → pnpm install → direnv allow → kind cluster
./scripts/bootstrap.sh

# Or skip cluster creation if you already have one
./scripts/bootstrap.sh --no-cluster
```

The bootstrap script handles the full dependency chain in the right order,
including steps that must happen before `reproctl` is available on PATH.
After it completes, `reproctl` works as a bare command in any new shell.
It also provisions the shared `agent-browser` Chrome runtime when needed, so
worktrees reuse the same machine-level install instead of duplicating browser
state per checkout.

### Verify your environment

```sh
reproctl doctor
```

Agent sessions assume the shared machine-local `agent-browser` CLI/runtime has
already been provisioned by bootstrap. The supported checks and recovery path
are `reproctl doctor` and `agent-browser doctor` (use `agent-browser doctor
--fix` when needed).

If `reproctl doctor` reports an `agent-browser` runtime problem, recover with:

```sh
agent-browser doctor
agent-browser doctor --fix
```

### Start services

```sh
# Start the workspace (includes api-server, database, storage, ingress)
reproctl start workspace

# Check what's running
reproctl status

# Open the Tilt dashboard
reproctl ui

# Tail logs
reproctl logs -f api-server
```

### Day-to-day commands

| Command                      | Description                        |
| ---------------------------- | ---------------------------------- |
| `reproctl start <service>`   | Start a service                    |
| `reproctl stop <service>`    | Stop a service                     |
| `reproctl stop --all`        | Tear down everything               |
| `reproctl restart <service>` | Rebuild and redeploy               |
| `reproctl status`            | Show running services              |
| `reproctl logs -f <service>` | Stream logs                        |
| `reproctl ui`                | Open Tilt dashboard                |
| `reproctl db reset`          | Drop + recreate + migrate database |
| `reproctl db shell`          | Open psql session                  |
| `reproctl doctor`            | Check environment health           |

### Parallel development with worktrees

```sh
# Create a worktree for a feature branch
reproctl wt create feat/my-feature

# Attach to the worktree
reproctl wt attach feat/my-feature

# Start isolated services from the worktree
reproctl start api-server

# List active worktrees
reproctl wt list

# Clean up
reproctl wt remove feat/my-feature
```

Worktrees reuse the same machine-level `agent-browser` install and Chrome
runtime. You only need to provision it once per Mac, not once per checkout.

### Teardown

```sh
reproctl stop --all          # Stop all services
reproctl cluster down        # Destroy the local cluster
```

### License

All code in this repository is licensed under the the terms of the [PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0/)
