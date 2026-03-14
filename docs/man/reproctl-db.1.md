% REPROCTL-DB(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-db - database operations

# SYNOPSIS

**reproctl db** **reset** [**-y** | **--yes**] | **migrate** | **shell** | **status**

# DESCRIPTION

Perform database operations against the PostgreSQL instance running inside the local cluster. Tilt must be running for all subcommands.

## Subcommands

**reset** [**-y** | **--yes**]
: Drop and recreate the database. This is only allowed from the main checkout, not from a worktree. Prompts for confirmation unless **-y** / **--yes** is given.

**migrate**
: Run any pending database migrations.

**shell**
: Open an interactive **psql** session connected to the development database.

**status**
: Display connection information and the current migration state. With the global **--json** flag, outputs a JSON object with host, port, database, and migration arrays (applied, pending, orphaned).

# OPTIONS

**-y**, **--yes**
: Used with **reset**. Skip the confirmation prompt.

# EXAMPLES

reproctl db status
: Show connection info and migration state.

reproctl --json db status
: Machine-readable database and migration info.

reproctl db migrate
: Apply pending migrations.

reproctl db shell
: Open a psql session.

reproctl db reset -y
: Drop and recreate without confirmation.

# SEE ALSO

**reproctl**(1), **reproctl-start**(1)
