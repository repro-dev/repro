% REPROCTL-WT(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-wt - manage git worktrees

# SYNOPSIS

**reproctl worktree** *subcommand* [*options*] [*branch*]

**reproctl wt** *subcommand* [*options*] [*branch*]

# DESCRIPTION

Manage git worktrees for isolated development. **wt** is a shorthand alias for **worktree**.

## Subcommands

**create** [**--dry-run**] *branch*
: Create a new git worktree for *branch*. If the branch does not exist, it is created from the current HEAD. After checkout, runs **pnpm install**, copies **.env** files from the main checkout, and runs **direnv allow** in the new worktree.

**remove** [**--dry-run**] *branch*
: Remove the worktree for *branch* via **git worktree remove**, then run **git worktree prune** to clean up stale references.

**list**
: Show all active worktrees and their associated branches.

**attach** *branch*
: Drop into a new subshell with the working directory set to the worktree for *branch*. Exit the subshell to return to your previous directory.

# OPTIONS

**--dry-run**
: Preview the operations that would be performed by **create** or **remove** without making any changes.

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

# SEE ALSO

**reproctl**(1), **git-worktree**(1)
