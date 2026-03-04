% REPROCTL-STOP(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-stop - stop services or tear down Tilt

# SYNOPSIS

**reproctl stop** [*service*...] | **--all**

# DESCRIPTION

Stop running services or tear down the entire Tilt session.

Without **--all**, the specified services are removed from the active service configuration. If no services remain after removal, Tilt is stopped automatically.

With **--all**, the Tilt daemon is stopped entirely, tearing down all running services regardless of which context started them.

# OPTIONS

**--all**
: Stop the Tilt daemon entirely instead of removing individual services.

**--pick**, **-p**
: Interactively select a service to stop. Uses **fzf** if installed, otherwise a numbered prompt. When no service names are given and stdin is a terminal, the picker is shown automatically.

# EXAMPLES

reproctl stop api-server
: Remove api-server from the running set.

reproctl stop --all
: Tear down Tilt and all services.

# SEE ALSO

**reproctl**(1), **reproctl-start**(1), **reproctl-restart**(1)
