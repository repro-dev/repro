# UI anti-pattern guardrail catalog

Use this catalog as shared vocabulary for review speed, not as a rigid ban list. A pattern can be acceptable when it is clearly deliberate, but if you can name the pattern, you can also explain why the choice is worth the cost.

## AI-convergent / generic UI tells

### Nested cards

- **Why it is a problem:** card-on-card-on-card stacks usually flatten hierarchy and make the page feel assembled from defaults rather than composed for the task.
- **When it is a real issue vs acceptable:** it is a real issue when nested containers exist only to add borders, padding, or shadow repetition; it is acceptable when each level has a distinct semantic role or interaction boundary.
- **Safer alternative:** collapse redundant surfaces, keep one clear parent container, and use spacing, grouping, or a section heading for separation instead of another card.

### Everything centered

- **Why it is a problem:** centered alignment everywhere weakens scanability and makes the screen feel template-driven.
- **When it is a real issue vs acceptable:** it is a real issue when centering is the default for the whole surface; it is acceptable for a focused empty state, a hero, or a deliberately minimal confirmation view.
- **Safer alternative:** anchor the main content to the task flow, use left alignment for readable content, and reserve centering for a single focal moment.

### Monotonous spacing

- **Why it is a problem:** repeated same-size gaps create a mechanically even rhythm that hides hierarchy.
- **When it is a real issue vs acceptable:** it is a real issue when every block uses the same spacing by habit; it is acceptable in tightly regular data grids or simple lists where uniformity is the point.
- **Safer alternative:** vary spacing by level of emphasis, tighten related items, and open up separations between distinct groups.

### Hero metric template layout

- **Why it is a problem:** large numbers, labels, and tiny supporting copy arranged in a stock grid often read like a generic dashboard hero.
- **When it is a real issue vs acceptable:** it is a real issue when the layout exists mainly because that pattern is common; it is acceptable when the metrics truly are the primary decision point and the hierarchy supports comparison.
- **Safer alternative:** make the dominant metric or action explicit, reduce decorative symmetry, and choose a layout that matches the actual decision the page supports.

### Decorative sparklines

- **Why it is a problem:** tiny charts used only as decoration add visual noise without helping the user decide anything.
- **When it is a real issue vs acceptable:** it is a real issue when the chart carries no interpretive value; it is acceptable when the trend itself is part of the decision or alert.
- **Safer alternative:** remove the sparkline, or replace it with a clearer status signal, trend annotation, or actual data context.

### Icon-above-heading feature cards

- **Why it is a problem:** repeated icon-tile + heading + body stacks can become the default AI feature-card shape and blur what matters.
- **When it is a real issue vs acceptable:** it is a real issue when the icon is only ornamental; it is acceptable when the icon encodes a meaningful category or the cards are intentionally scanning-oriented.
- **Safer alternative:** use a stronger content hierarchy, make the card title do more work, or switch to a layout that reflects the feature’s actual relationship structure.

## General quality anti-patterns

### Side-tab accent borders

- **Why it is a problem:** accent borders on a tab rail often look decorative and can misrepresent hierarchy or state.
- **When it is a real issue vs acceptable:** it is a real issue when the accent is doing all the work instead of the selected state; it is acceptable when the border is part of a coherent navigation system with clear semantics.
- **Safer alternative:** use a stronger selected state treatment, clearer grouping, or a layout that makes the active section obvious without relying on a stripe.

### Every button is primary

- **Why it is a problem:** overusing primary buttons removes action priority and makes the page feel push-button generic.
- **When it is a real issue vs acceptable:** it is a real issue when multiple actions compete visually with equal emphasis; it is acceptable when there is truly one dominant action and the rest are secondary or destructive.
- **Safer alternative:** keep one primary action, downgrade the rest to secondary or text variants, and order actions by actual importance.

### Modal by reflex

- **Why it is a problem:** reaching for a modal too early interrupts flow and often hides a simpler inline or drawer-based interaction.
- **When it is a real issue vs acceptable:** it is a real issue when the modal is used for ordinary page flow or shallow decisions; it is acceptable for focused confirmation, blocking errors, or genuinely temporary tasks that need full attention.
- **Safer alternative:** prefer inline expansion, a drawer, or a dedicated page when the user needs context while acting.
