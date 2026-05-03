# Visual Layering & Overlay Guardrails

Use this companion when the UI needs a stable stacking model, an overflow-safe escape hatch, or a clear rule for what may float above what. These are guardrails, not rigid bans: a layer can be acceptable when it is clearly deliberate and the user still gets the right content in the right place.

## Layering model

- Prefer a small, named set of depth tiers instead of ad hoc `z-index` escalation.
- Keep the base surface, sticky chrome, transient overlays, and blocking overlays distinct.
- Treat `z-index` as a contract between layers, not a number to keep increasing when something overlaps.

## Clipping and escape hatches

- If content must escape `overflow` clipping, render it through a portal or a dedicated overlay container.
- Use escape hatches intentionally for popovers, dropdowns, tooltips, sheets, and modals that cannot live inside the clipped ancestor.
- Keep the escape route close to the trigger so the rendered surface still feels attached to the interaction.

## Sticky and floating elements

- Sticky headers, toolbars, and side rails should not obscure the first meaningful content beneath them.
- Reserve space or padding where sticky regions overlap the scroll area.
- Avoid stacking multiple floating surfaces so they compete for the same visual band.

## Named patterns

- **Stable stacking model** — a finite set of depth tiers that prevents z-index chaos.
- **Portal escape hatch** — render outside the clipped ancestor when the surface must float freely.
- **Clip-safe overlay** — keep the overlay readable and interactive even near scroll containers.
- **Sticky separation** — ensure sticky chrome never covers primary content or actions.

## Anti-patterns

- **Z-index chaos** — escalating numbers until one layer happens to win.
- **Clipped overlay** — dropdowns, popovers, or tooltips cut off by their container.
- **Sticky overlap** — pinned chrome obscures the content it is meant to support.
- **Orphaned overlay** — a floating surface with no clear anchor, escape path, or dismissal rule.
