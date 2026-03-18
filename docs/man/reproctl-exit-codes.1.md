% REPROCTL-EXIT-CODES(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-exit-codes - exit code conventions for reproctl commands

# SYNOPSIS

**reproctl help exit-codes**

# DESCRIPTION

reproctl uses a small, fixed set of exit codes so that scripts and agents can reliably determine the outcome of any command.

# EXIT CODES

**0** — Success
: The operation completed as expected.

**1** — Error
: The operation failed due to bad input, a runtime failure, or a missing prerequisite.

**2** — User cancelled
: The user cancelled an interactive prompt (Ctrl-C in a picker, empty input, or answering "n" to a confirmation that aborts the operation).

# CONVENTIONS

## Status commands

**status**, **cluster status**, **db status**, and **context** are *queries* — they report the current state of the system. They return **0** when they successfully produce output, even if the thing being checked is unhealthy or not running. The health information is conveyed in the output, not the exit code.

## Health-assertion commands

**checkhealth** and **doctor** are *assertions* — they verify that the environment meets expectations. They return **0** when all checks pass (or only warnings are found) and **1** when errors are detected.

## Action commands

**start**, **stop**, **restart**, **cluster up**, **cluster down**, **cluster reset**, **db reset**, **db migrate**, **db seed**, **wt create**, **wt remove**, and **wt prune** perform a mutation. They return **0** on success and **1** on failure.

## die()

The internal **die()** helper always exits **1**. Commands that call die on fatal errors conform to the exit code table automatically.

## Interactive pickers

When a command invokes an interactive picker (**--pick** flag or automatic picker on a terminal), user cancellation (Ctrl-C in fzf, empty input in the numbered prompt) exits **2**.

# EXAMPLES

```
reproctl status
echo $?    # 0 — even if Tilt is not running

reproctl checkhealth
echo $?    # 1 if errors found, 0 otherwise

reproctl start api-server
echo $?    # 0 on success, 1 on failure

reproctl start --pick   # user presses Ctrl-C
echo $?    # 2

reproctl db status
echo $?    # 0 — even if Tilt is not running
```

# SEE ALSO

**reproctl**(1)
