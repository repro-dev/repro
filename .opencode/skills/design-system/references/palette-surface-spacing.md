# Palette, Surface, and Spacing

Use this companion reference when the question is not just “is it valid?” but “does it feel intentional?”. It covers composition, surface treatment, spacing rhythm, and the named failure modes that make a screen feel generic even when it is technically compliant.

## What to look for

- Neutral tinting instead of defaulting to harsh pure black / pure white everywhere.
- Clear surface hierarchy: one primary surface, secondary surfaces only when they earn their keep.
- Spacing that creates rhythm and grouping, not a mechanically even grid everywhere.
- Color pairs that preserve contrast; avoid washed-out gray-on-color combinations.
- Emphasis that comes from hierarchy first; decorative gradient text is not the default solution.

## Safer alternatives

- Use a single container with spacing and grouping before adding more cards.
- Vary spacing between sections, clusters, and items so the eye can tell what belongs together.
- Keep the dominant reading path obvious; let secondary content recede instead of centering everything equally.
- Use color tokens to separate surfaces and states, not to flatten them into similar-looking layers.

## Named anti-patterns

- **Nested cards** — multiple boxed surfaces inside each other without a stronger hierarchy. Prefer one clear surface with interior spacing, dividers, or section groupings.
- **Wrapping everything in cards** — every block gets a border or shadow, which turns the page into visual noise. Prefer flat sections unless the content needs a distinct surface.
- **Everything centered** — center alignment used by default instead of to emphasize a narrow focal point. Prefer left-aligned reading flow unless the layout truly benefits from centering.
- **Monotonous spacing** — the same gap repeated everywhere, which removes rhythm and hierarchy. Prefer deliberate small / medium / large spacing steps.
- **Gray-on-color washout** — low-contrast foreground and background colors that look muted or accidental. Prefer token pairs with clearer separation.
- **Gradient-text-as-default** — decorative gradient text used for ordinary emphasis. Reserve it for rare, intentional moments if it appears at all.

## Quick judgment test

If a screen is “compliant” but still feels flat, ask:

1. Where is the focal point?
2. What should recede?
3. Which surfaces are actually necessary?
4. Does the spacing create rhythm, or just repeat?
5. Is any anti-pattern doing the work that hierarchy should do instead?
