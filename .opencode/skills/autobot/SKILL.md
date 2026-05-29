---
name: autobot
description: Autobot delivery automation, phase-specific agents, session safety, FlowCraft runtime, and command/tool guardrails. Load when working in packages/autobot-core, packages/autobot-cli, packages/autobot-flowcraft, or docs/autobot.
---

# Autobot

Reference for Autobot delivery automation. Load this skill before implementing Autobot session orchestration, phase policy, FlowCraft runtime changes, or command/tool safety.

## Safety Architecture

- Prefer phase-specific `autobot-*` agents as the primary enforcement boundary for phase authority.
- Configure each phase agent with the read/write/tool permissions it needs; do not rely on command-output parsing to enforce phase policy.
- Keep `cc-safety-net` as a cross-cutting defense-in-depth guardrail for truly destructive shell commands.
- Do not use `cc-safety-net` as the primary mechanism for Autobot phase-specific policy such as planning vs develop vs review authority.
- Treat phase policy, write-root validation, publish gating, and credential handling as Autobot-owned concerns.

## Phase Agents

When adding or changing phase behavior, start from the intended phase agent contract.

- Planning agents should be read-oriented and should not need write permissions or mutation-capable publish tools.
- Develop agents may write source and run focused verification, but should not publish, push, merge, or inspect credentials.
- Review agents should inspect diffs and report findings without mutating the branch.
- Publish/release agents require explicit gating and should be separated from planning/develop/review authority.

## Command Safety

Use command classification for explicit safety stops, evidence, and tests, but place prevention at the agent/tool permission boundary whenever possible.

Examples of commands that should remain blocked by cross-cutting guardrails regardless of phase:

```sh
git reset --hard
git clean -xfd
git push --force
rm -rf .git
security find-generic-password
```

Examples of phase-authority decisions that should be handled by phase-agent permissions or Autobot-owned policy rather than by `cc-safety-net` alone:

```sh
moon run repro/autobot-cli:test
apply_patch
gh pr create
linear issue update REP-123 --status "In Review"
```

## Relay Parity

Agent Relay-backed Autobot sessions must preserve the same phase authority as local sessions. Prefer sharing the same phase-agent contract and Autobot-owned policy inputs across local and relayed execution instead of duplicating ad hoc denylists.
