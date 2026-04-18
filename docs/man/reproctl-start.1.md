% REPROCTL-START(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-start - start services via Tilt

# SYNOPSIS

**reproctl start** [**--wait**] [**--timeout** *duration*] _service_ [*service*...]

# DESCRIPTION

Start one or more services from the current context (main checkout or worktree).

Service names are validated against the project's **services.json** manifest. The requested services are written to **reproctl_services.json**, which the Tiltfile reads to determine which resources to enable.

If the Tilt daemon is not already running, it is started automatically.

When invoked from a worktree, services are isolated with a worktree-slug suffix so they do not conflict with services running from the main checkout or other worktrees.

If no service names are provided and stdin is a terminal, an interactive picker is shown (using **fzf** if available, or a numbered prompt).

The available service list in **reproctl start --help** is generated directly from **infra/services.json**, so new services appear automatically without shell-script changes.

For extension verification, `reproctl start --wait capture` or `reproctl start --wait dev-toolbar` is the standard prep step before `agent-browser` attaches to the isolated browser session. This brings up the extension build/watch pipeline and any required local services before browser automation begins.

# OPTIONS

**--pick**, **-p**
: Interactively select a service. Uses **fzf** if installed, otherwise a numbered prompt.

**--wait**, **-w**
: Block until all started services report healthy status. While waiting, the full transitive dependency tree is resolved from **services.json** and the status of all dependencies (infrastructure, migrations, dependent services) is shown alongside the target services. In a TTY, a multi-line updating display is shown on stderr. When not a TTY, periodic single-line status updates are printed to stderr every 10 seconds. Exits 0 on success, 1 on timeout. In **--json** mode, outputs the final service status JSON on success, or an error object on timeout.

**--timeout**, **-t** _duration_
: How long to wait before giving up when **--wait** is set. Accepts a number of seconds, optionally with an **s** suffix (e.g. **120s**, **60**). By default, **--wait** blocks indefinitely with no timeout. Only meaningful with **--wait**.

# EXIT CODES

**0**
: Services started successfully (and healthy, if **--wait** was used).

**1**
: Error, or timeout when waiting for services.

# EXAMPLES

reproctl start api-server
: Start the api-server from the current context.

reproctl start api-server workspace
: Start multiple services at once.

reproctl start --wait api-server
: Start the api-server and block until it is healthy. Shows database, storage, and migration dependency status while waiting.

reproctl start --wait capture
: Prepare the capture-extension workflow by waiting for the extension build/watch pipeline and local dependencies to become healthy.

reproctl start --wait dev-toolbar
: Prepare the Dev Toolbar extension workflow by waiting for the extension build/watch pipeline and local dependencies to become healthy.

reproctl start --wait --timeout 60s api-server workspace
: Start services and wait up to 60 seconds for all to become healthy.

reproctl --json start --wait api-server
: Start the api-server, wait for healthy, and output final status as JSON.

# SEE ALSO

**reproctl**(1), **reproctl-stop**(1), **reproctl-restart**(1), **reproctl-logs**(1)
