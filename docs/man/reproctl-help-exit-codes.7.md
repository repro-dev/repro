% REPROCTL-HELP-EXIT-CODES(7) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-help-exit-codes - exit codes returned by reproctl commands

# DESCRIPTION

reproctl uses a small set of exit codes consistently across all commands.
Scripts and CI pipelines can rely on these values to distinguish between
different failure modes.

# EXIT CODES

**0**
: Success. The command completed without errors.

**1**
: Error. The command failed due to a runtime error, invalid input, or an
  unrecoverable condition.

**2**
: User cancelled. The user aborted an interactive prompt or confirmation
  dialog (e.g., answering "no" to a destructive operation).

# EXAMPLES

    reproctl db reset
    case $? in
      0) echo "Database reset successfully" ;;
      1) echo "Reset failed" ;;
      2) echo "Reset cancelled by user" ;;
    esac

# SEE ALSO

**reproctl**(1), **reproctl-help-environment**(7), **reproctl-help-json**(7)
