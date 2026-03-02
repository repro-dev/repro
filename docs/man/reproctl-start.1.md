% REPROCTL-START(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-start - start services via Tilt

# SYNOPSIS

**reproctl start** *service* [*service*...]

# DESCRIPTION

Start one or more services from the current context (main checkout or worktree).

Service names are validated against the project's **services.json** manifest. The requested services are written to **reproctl_services.json**, which the Tiltfile reads to determine which resources to enable.

If the Tilt daemon is not already running, it is started automatically.

When invoked from a worktree, services are isolated with a worktree-slug suffix so they do not conflict with services running from the main checkout or other worktrees.

# EXAMPLES

reproctl start api-server
: Start the api-server from the current context.

reproctl start api-server workspace
: Start multiple services at once.

# SEE ALSO

**reproctl**(1), **reproctl-stop**(1), **reproctl-restart**(1), **reproctl-logs**(1)
