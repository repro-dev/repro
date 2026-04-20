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

When **--profile** is given, the matching **.opencode/profiles/**_name_**.json**
file is layered on top of the tracked project config in
**.opencode/opencode.json** and passed to OpenCode via the
**OPENCODE_CONFIG** environment variable. OpenCode merges this config with its
own defaults, so only the fields present in the profile file are overridden.

On macOS, the launch is wrapped in **caffeinate -dims** to prevent display
sleep, idle sleep, and disk sleep during long agent sessions. On other
platforms, OpenCode is launched directly.

Profile files are committed and live at **.opencode/profiles/**_name_**.json**.
The **github-copilot-sonnet** profile documents the canonical model configuration. The
**openrouter-glm5-minimax** profile remaps agents to GLM-5.1 and MiniMax M2.7 via OpenRouter.

# OPTIONS

**--profile** _name_
: Activate the profile at **.opencode/profiles/**_name_**.json**. Exits with an
error if the profile file does not exist.

**-h**, **--help**
: Show usage.

# PROFILES

Profile files are valid **opencode.json** fragments that override
`agent.<name>.model` for one or more named agents. Only the keys present in the
profile are applied; other agent settings remain unchanged.

Current profiles:

**github-copilot-sonnet**
: Mirrors the models hardcoded in the agent files (all five agents use
**github-copilot/claude-sonnet-4.6**).

**openrouter-glm5-minimax**
: Remaps agents to **openrouter/z-ai/glm-5.1** (planner, review) and
**openrouter/minimax/minimax-m2.7** (develop, test, release) via OpenRouter.

# EXAMPLES

reproctl opencode
: Launch OpenCode with no profile override.

reproctl opencode --profile openrouter-glm5-minimax
: Launch OpenCode with GLM-5.1 and MiniMax M2.7 via OpenRouter.

reproctl opencode --profile github-copilot-sonnet run "do the thing"
: Launch OpenCode with the GitHub Copilot Sonnet profile and pass a run command through to opencode.

reproctl opencode --profile nonexistent
: Exits with an error listing available profiles.

# SEE ALSO

**reproctl**(1), **opencode**(1)
