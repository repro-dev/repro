% REPROCTL-CLUSTER(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-cluster - manage the local kind cluster

# SYNOPSIS

**reproctl cluster** **up** | **down** [**--force**] | **status** | **reset**

# DESCRIPTION

Manage the local kind Kubernetes cluster and its associated container registry.

## Subcommands

**up**
: Create the kind cluster and local container registry. This operation is idempotent — if the cluster already exists, it is left untouched.

**down** [**--force**]
: Tear down the cluster and registry. If services are currently running in Tilt, a warning is displayed and the operation is aborted unless **--force** is specified.

**status**
: Show the current state of the cluster and registry (running, stopped, or not found).

**reset**
: Equivalent to **down --force** followed by **up**. Destroys the existing cluster and creates a fresh one.

# OPTIONS

**--force**
: Used with **down**. Tears down the cluster even when services are still running in Tilt.

# EXAMPLES

reproctl cluster up
: Create the cluster (no-op if it already exists).

reproctl cluster status
: Check whether the cluster is running.

reproctl cluster down --force
: Tear down even with running services.

reproctl cluster reset
: Destroy and recreate the cluster.

# SEE ALSO

**reproctl**(1), **reproctl-setup**(1)
