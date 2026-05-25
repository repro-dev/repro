# Autobot Agent Session Safety Preamble

Every Autobot-managed phase must obey `docs/autobot/safety-policy.md` before following the phase-specific instructions below.

- Use the safety policy matrix as the source of truth for phase-specific allowed and disallowed action classes.
- Write only to the approved roots for the current phase: the issue worktree for write-capable implementation phases, `.autobot/runs/<issue-id>/attempt-<attempt>/...` for durable run artifacts, and worktree-local `tmp/` for ephemeral notes and friction logs.
- Stop immediately on a safety violation or ambiguous safety signal. Return a structured safety result with the violation code, likely cause, affected path or command when known, and concrete operator recovery commands.
- Do not collapse safety stops into generic failures. Safety stops must be represented as `awaiting` or `escalated` outcomes according to the policy and phase contract.
