% REPROCTL-OPENCODE(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-opencode - launch OpenCode with an optional model profile

# SYNOPSIS

**reproctl opencode** [**--profile** *name*] [*opencode-args...*]

# DESCRIPTION

Launch OpenCode, optionally activating a model profile that overrides the
**model** field for each agent without editing the agent definition files in
**.opencode/agents/**.

When **--profile** is given, the matching **.opencode/profiles/<name>.json**
file is passed to OpenCode via the **OPENCODE_CONFIG** environment variable.
OpenCode merges this config with its own defaults, so only the fields present
in the profile file are overridden.

On macOS, the launch is wrapped in **caffeinate -dims** to prevent display
sleep, idle sleep, and disk sleep during long agent sessions. On other
platforms, OpenCode is launched directly.

Profile files are committed and live at **.opencode/profiles/<name>.json**.
The **default** profile documents the canonical model configuration. The
**openrouter** profile remaps agents to models available via OpenRouter.

# OPTIONS

**--profile** _name_
: Activate the profile at **.opencode/profiles/<name>.json**. Exits with an
error if the profile file does not exist.

**-h**, **--help**
: Show usage.

# PROFILES

Profile files are valid **opencode.json** fragments that override **agent.**
**_name_**.model\*\* for one or more named agents. Only the keys present in the
profile are applied; other agent settings remain unchanged.

Current profiles:

**default**
: Mirrors the models hardcoded in the agent files (all five agents use
**github-copilot/claude-sonnet-4.6**).

**openrouter**
: Remaps agents to **openrouter/z-ai/glm-5.1** and
**openrouter/minimax/minimax-m2.7** via OpenRouter.

# EXAMPLES

reproctl opencode
: Launch OpenCode with no profile override.

reproctl opencode --profile openrouter
: Launch OpenCode with the openrouter model profile.

reproctl opencode --profile default run "do the thing"
: Launch OpenCode with the default profile and pass a run command through to opencode.

reproctl opencode --profile nonexistent
: Exits with an error listing available profiles.

# SEE ALSO

**reproctl**(1), **opencode**(1)
