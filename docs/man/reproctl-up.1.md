% REPROCTL-UP(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-up - bring the development environment online

# SYNOPSIS

**reproctl** [**--json**] **up** [*service*...] [**--wait**]

# DESCRIPTION

Bring the full development environment online with a single command.
Ensures the local kind cluster is running, then starts the requested
services via Tilt.

If no services are specified, all services defined in **services.json**
are started. If specific services are given, only those are started.

When the cluster is already running, the cluster-creation step is skipped.
When Tilt is already running, the new services are merged into the running
configuration (same as **reproctl start**).

# OPTIONS

**--wait**
: Block until all started services report a healthy runtime status.
  Times out after 300 seconds with a warning.

**--json**
: Output a JSON summary of the operation. The object includes the
  command name and the list of services that were started.

# EXAMPLES

reproctl up
: Start all services (cluster is created if needed).

reproctl up api-server workspace
: Start only api-server and workspace.

reproctl up --wait
: Start all services and block until healthy.

reproctl --json up api-server
: Start api-server and output JSON summary.

# SEE ALSO

**reproctl**(1), **reproctl-down**(1), **reproctl-start**(1), **reproctl-cluster**(1)
