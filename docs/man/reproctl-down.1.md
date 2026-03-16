% REPROCTL-DOWN(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-down - stop all services and optionally tear down the cluster

# SYNOPSIS

**reproctl** [**--json**] **down** [**--cluster**]

# DESCRIPTION

Stop all running services by tearing down the Tilt daemon. This is
equivalent to **reproctl stop --all**.

By default, the kind cluster is left running so that a subsequent
**reproctl up** can start quickly. Use **--cluster** to also remove the
cluster and container registry.

# OPTIONS

**--cluster**
: Also tear down the kind cluster and container registry after stopping
  services.

**--json**
: Output a JSON summary of the operation. The object includes the
  command name and whether the cluster was removed.

# EXAMPLES

reproctl down
: Stop all services, leave cluster running.

reproctl down --cluster
: Stop all services and tear down the cluster.

reproctl --json down
: Stop all services and output JSON summary.

# SEE ALSO

**reproctl**(1), **reproctl-up**(1), **reproctl-stop**(1), **reproctl-cluster**(1)
