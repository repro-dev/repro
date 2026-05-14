# Greenfield Autobot Specs

These documents are the tracked implementation specs for the greenfield Autobot CLI and FlowCraft engine delivery tracked by `REP-1148`.

## Documents

- `greenfield-plan.md` — product goals, architecture, FlowCraft fit, and phased delivery plan.
- `cli-design.md` — target operator CLI semantics and command behavior.
- `implementation-contracts.md` — implementation-ready state model, JSON schemas, event taxonomy, errors, config, selection policy, and renderer examples.
- `decisions.md` — frontloaded implementation decisions that constrain the child issues.

## Constraint

This is a greenfield Autobot delivery. Do not integrate with, import from, wrap, or preserve behavior from the existing `autobot` implementation. Use existing docs only as product/spec context. The old implementation will be reconciled, replaced, or deleted only after this greenfield path is proven.
