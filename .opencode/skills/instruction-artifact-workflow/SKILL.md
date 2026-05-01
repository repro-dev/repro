---
name: instruction-artifact-workflow
description: Repro/OpenCode workflow for designing, placing, and reviewing AI-facing instruction artifacts. Load when creating or materially changing .opencode skills, agents, commands, or AGENTS.md guidance.
---

# Instruction Artifact Workflow

Use this skill when deciding where an OpenCode instruction artifact belongs, or when changing one materially.

## Artifact taxonomy

- `AGENTS.md` at repo root: always-on, cross-cutting policy, task entry points, delegation rules, and repo-wide constraints.
- Package/domain `AGENTS.md`: always-on only within that subtree; use for conventions too local for root.
- `.opencode/skills/*/SKILL.md`: reusable workflows, domain knowledge, checklists, and standards.
- `.opencode/commands/*.md`: thin command shims that parse arguments, validate modes, and hand off to a skill.
- `.opencode/agents/*.md`: delegated role contracts with permissions, startup steps, and output shape.
- `tmp/context-*.md` / `tmp/test-plan-*.md`: one-off working context, not durable guidance.

## Placement decision

1. Does every agent need it? Put it in root `AGENTS.md`.
2. Does only one package/domain need it? Put it in that package's `AGENTS.md`.
3. Is it reusable workflow or domain guidance? Make it a skill.
4. Is it just a shortcut entrypoint? Keep the command thin and point it at the owning skill.
5. Is it a delegated role with a boundary and output contract? Make it an agent file.
6. Is it temporary context for one issue? Keep it in `tmp/`.

## Create vs update

- Update an existing artifact when the concept already belongs there, the guidance is stale, or the change only needs clarification.
- Create a new skill when the workflow is reusable, has a distinct trigger, and would otherwise bloat `AGENTS.md` or a command.
- Create or update an agent only when the work needs a distinct role, permission boundary, startup sequence, or output contract.
- Create a command only when users need a shortcut and the command can stay a shim.

## Quality checklist

- Clear trigger in the frontmatter or description.
- Short startup guidance before deeper detail.
- Lean body; do not repeat the parent `AGENTS.md` or sibling skills.
- Concrete examples for contracts, outputs, and review findings.
- Explicit placement rationale.
- Composes with existing skills instead of replacing them.
- Agent files state permissions and boundaries clearly.
- No stale paths, renamed symbols, or copied external marketplace/plugin mechanics.
- Sections stay small enough to review quickly.

## Composition

- Load `command-thin-shim` before adding or refactoring `.opencode/commands/*.md`.
- Use `skill-compliance` as the post-change pass for instruction-artifact changes.
- Use `review-standards` for branch and PR reviews; keep findings changed-code focused.
- Follow root `AGENTS.md` skill-maintenance guidance when deciding whether to update a skill, package `AGENTS.md`, or file follow-up work.

## Workflow

1. Scope the audience, trigger, and lifecycle.
2. Choose the artifact location with the taxonomy.
3. Draft the smallest useful guidance.
4. Compose with the owning skills instead of duplicating them.
5. Review for clarity, placement, and overreach.

## Anti-patterns

- Huge command files that embed full workflows.
- Root `AGENTS.md` used as a dumping ground for rare guidance.
- New skills with vague triggers or overlapping scope.
- Agent files without explicit permissions or output boundaries.
- Copying external plugin-marketplace mechanics into repo guidance.
