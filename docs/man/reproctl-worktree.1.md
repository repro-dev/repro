% REPROCTL-WORKTREE(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-worktree - manage git worktrees

# SYNOPSIS

**reproctl worktree** *subcommand* [*options*] [*branch*]

**reproctl wt** *subcommand* [*options*] [*branch*]

# DESCRIPTION

Manage git worktrees for isolated development. **wt** is a shorthand alias for **worktree**.

## Subcommands

**create** [**--from-issue** *id*] [**--no-status-update**] [**--skip-install**] [**--dry-run**] *branch*
: Create a new git worktree for *branch*. If the branch does not exist, it is created from the current HEAD. After checkout, runs **pnpm install**, copies **.env** files from the main checkout, and runs **direnv allow** in the new worktree. With **--from-issue**, fetches the branch name from a Linear issue and sets it to In Progress. With **--skip-install**, dependency installation and package building are skipped and left to the caller.

**remove** [**--dry-run**] [*branch*]
: Remove the worktree for *branch* via **git worktree remove**, then run **git worktree prune** to clean up stale references. If *branch* is omitted and stdin is a terminal, an interactive picker is shown.

**list**
: Show all active worktrees and their associated branches.

**attach** [*branch*]
: Drop into a new subshell with the working directory set to the worktree for *branch*. Exit the subshell to return to your previous directory. If *branch* is omitted and stdin is a terminal, an interactive picker is shown.

**prune** [**--dry-run**] [**--yes**]
: Remove worktrees whose branches have been merged into main or whose upstream tracking branch no longer exists on the remote.

# OPTIONS

**--dry-run**
: Preview the operations that would be performed by **create**, **remove**, or **prune** without making any changes.

**--from-issue**, **-i** *id*
: Fetch the branch name from a Linear issue (e.g., **REP-123**). Only valid with **create**.

**--no-status-update**
: Skip setting the Linear issue to In Progress. Only valid with **--from-issue**.

**--skip-install**
: Skip running **pnpm install** and **moon run :build** after checkout. Only valid with **create**. Dependency installation is deferred to the caller (for example, the deliver CLI sends **pnpm install** to the workspace terminal pane).

**--yes**, **-y**
: Skip the confirmation prompt when pruning.

# INTERACTIVE PICKER

When **attach** or **remove** is called without a branch name and stdin is a terminal, an interactive picker is shown. If **fzf** is installed, it provides fuzzy selection; otherwise a numbered prompt is displayed.

# EXAMPLES

reproctl worktree create feat/my-feature
: Create a worktree, install dependencies, and configure direnv.

reproctl wt create feat/my-feature
: Same as above using the shorthand alias.

reproctl wt attach feat/my-feature
: Drop into the worktree subshell.

reproctl worktree list
: Show all active worktrees.

reproctl worktree remove feat/my-feature
: Remove a worktree and prune references.

reproctl wt remove --dry-run feat/old-branch
: Preview removal without making changes.

reproctl wt attach
: Pick a worktree interactively.

reproctl wt create -i REP-123
: Create a worktree from a Linear issue.

reproctl worktree prune --dry-run
: Preview which worktrees would be pruned.

# SEE ALSO

**reproctl**(1), **git-worktree**(1)
