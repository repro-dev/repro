% REPROCTL-RESTART(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-restart - rebuild services or restart Tilt

# SYNOPSIS

**reproctl restart** *service* [*service*...] | **--all**

# DESCRIPTION

Rebuild and redeploy running services, or restart the entire Tilt daemon.

Without **--all**, triggers a rebuild of the specified services via **tilt trigger**. If a service has an associated migration resource, the migration is triggered first.

With **--all**, the Tilt daemon is stopped and restarted while preserving the current service configuration from **reproctl_services.json**.

# OPTIONS

**--all**
: Stop and restart the Tilt daemon instead of rebuilding individual services.

# EXAMPLES

reproctl restart api-server
: Rebuild and redeploy api-server.

reproctl restart api-server workspace
: Rebuild multiple services.

reproctl restart --all
: Restart the Tilt daemon with the same services.

# SEE ALSO

**reproctl**(1), **reproctl-start**(1), **reproctl-stop**(1)
