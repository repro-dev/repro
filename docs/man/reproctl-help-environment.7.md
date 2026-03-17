% REPROCTL-HELP-ENVIRONMENT(7) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-help-environment - environment variables used by reproctl

# DESCRIPTION

reproctl reads the following environment variables. Variables marked as
*automatic* are set by reproctl itself and should not be overridden.

# VARIABLES

**LINEAR_API_KEY**
: A Linear personal API key. Used by **reproctl wt create --from-issue** to
  fetch issue metadata (branch name, title) from the Linear API.

**REPRO_WORKTREE** *(automatic)*
: Set to the worktree name (branch slug) inside subshells created by
  **reproctl wt attach**. Empty in the main checkout.

**REPRO_WORKTREE_BRANCH** *(automatic)*
: Set to the full branch name inside worktree subshells created by
  **reproctl wt attach**.

**REPRO_WORKTREE_PATH** *(automatic)*
: Set to the absolute path of the worktree directory inside subshells
  created by **reproctl wt attach**.

**NO_COLOR**
: When set to any non-empty value, disables all colored output. Follows the
  convention at <https://no-color.org>. Overrides terminal detection.

**REPROCTL_DEBUG**
: When set to any non-empty value, enables verbose debug output to stderr.
  Useful for troubleshooting command execution.

# SEE ALSO

**reproctl**(1), **reproctl-help-exit-codes**(7), **reproctl-help-json**(7)
