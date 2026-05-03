---
name: skill-architecture
description: Meta guidance for organizing OpenCode skills — workflow vs discipline vs reference files, naming, load order, and migration boundaries.
---

# Skill Architecture

Use this skill when deciding where new OpenCode guidance belongs or how to refactor the skill surface.

## When to load

- creating or renaming skills
- deciding whether guidance should be a skill or a reference file
- updating `AGENTS.md`, skill routing, or migration policy

## Model

- **Workflow skills** coordinate phases of work. They answer: what is happening now?
- **Discipline skills** own a domain or file-surface contract. They answer: what rules apply here?
- **Reference files** hold long catalogs, examples, checklists, and other load-on-demand details.

Keep `SKILL.md` files thin. Put durable but verbose material in colocated `references/` files.

## Create a skill when

- the guidance changes how agents choose, sequence, or verify work
- the content should be loaded directly by name
- the guidance is a reusable contract, not just a lookup table

## Create a reference file when

- the content is long, specific, or example-heavy
- the content is a catalog, checklist, or decision table
- the content is useful only after the main skill has already been chosen

## Naming rules

- Use `-workflow` for phase orchestration.
- Use clear domain names for discipline skills.
- Avoid cartesian skill grids unless they remove real ambiguity.
- Prefer renames only when the old name is genuinely misleading.

## Load order

1. Load the workflow skill for the phase.
2. Load one or more discipline skills for the affected surface.
3. Load `references/` files only when a concern needs shared vocabulary or a detailed catalog.
4. Load `design-handoff` only when agent-authored UI decisions must survive downstream handoffs.

## Migration policy

- Move detail out of `SKILL.md` before inventing new top-level skills.
- Keep the top-level surface small and legible.
- Do not add nested skill taxonomies unless the tooling explicitly supports them.
- Preserve existing names unless a rename removes real confusion.

## Boundaries

- Workflow skills should not become domain encyclopedias.
- Discipline skills should not re-explain generic workflow mechanics.
- Reference files should not be loaded as standalone skills.
