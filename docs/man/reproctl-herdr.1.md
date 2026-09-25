% REPROCTL-HERDR(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-herdr - open the current checkout in a project-scoped Herdr session

# SYNOPSIS

**reproctl herdr open**

# DESCRIPTION

Opens or reuses the current checkout as a Herdr workspace. Repeated calls use the canonical checkout path to find an existing workspace before opening one, and do not take focus from the current workspace.

The repository-owned **.herdr/config.toml** is selected with **HERDR_CONFIG_PATH**. A deterministic named Herdr session is derived from the canonical main checkout. This keeps Repro's settings separate from the default session and does not modify the user's global Herdr config.

Herdr does not expose a supported query to verify the config loaded by an already-running server. reproctl therefore reports the active server config as unverified. It does not stop or restart an existing session or close unrelated workspaces to apply the project settings. Opening a checkout does not start Tilt services.

Issue-based worktrees and **deliver** report a known Linear issue title as **issue_title** metadata while retaining the issue-ID workspace label. The title is truncated to Herdr's 80-character metadata value limit when needed.

# FAILURE RECOVERY

If the Herdr executable is missing, install it with:

    brew install herdr

If the project-scoped daemon is unavailable, run the foreground server for only that named session with the config path and command printed by reproctl, for example:

    HERDR_CONFIG_PATH="/path/to/repo/.herdr/config.toml" herdr --session repro-<24-hex-digits> server

The server remains in the foreground. Then retry **reproctl herdr open** in another shell.

# EXAMPLES

reproctl herdr open
: Open the current checkout in the project's named Herdr session.

reproctl setup --open-herdr
: Run environment setup, then open the current checkout in Herdr.

# SEE ALSO

**reproctl**(1), **reproctl-setup**(1)
