# Typography and readability guardrails

Use this reference when a surface needs clearer hierarchy, easier scanning, or tighter prose readability. Keep it additive to the rest of the design system: these rules refine typography choices; they do not replace layout, component, or interaction guidance.

## Core heuristics

- **Minimum body size** — body copy should usually stay at a comfortably readable size in app UIs; avoid tiny body text for primary content. Use smaller text only for tertiary metadata, labels, or chrome that is clearly secondary.
- **Hierarchy separation between steps** — adjacent steps, labels, and body copy should not collapse into the same visual weight. Use size, weight, and spacing to make the next step obvious.
- **Line length** — keep paragraph copy to a readable measure; sustained lines that run too wide become hard to scan. Narrow the column, split the content, or break the copy into smaller blocks when lines drift long.
- **Line height** — body paragraphs need enough leading to breathe. Tight line-height that looks compact in isolation often becomes tiring in multi-line content.
- **Fixed-rem scales vs fluid heading scales** — prefer fixed rem-based type scales in app UIs where layout predictability and readable hierarchy matter more than continuous scaling. Reserve fluid heading scales for surfaces that are intentionally more editorial or hero-like.

## Named anti-patterns

### Flat type hierarchy

- **Why it is a problem:** when headings, labels, and body text all look alike, readers cannot tell what matters first.
- **Safer alternative:** create a clear step between title, section heading, supporting text, and metadata using the shared text styles.
- **Applicability note:** acceptable only when the content is intentionally uniform, such as a compact list of peer items.

### Tiny body text

- **Why it is a problem:** small body copy lowers legibility and makes paragraphs feel like chrome instead of content.
- **Safer alternative:** raise the body style, then recover density with spacing and layout rather than shrinking text.
- **Applicability note:** acceptable for tertiary metadata, not for primary instructions, prose, or error explanations.

### All-caps body text

- **Why it is a problem:** all-caps body copy reduces word-shape recognition and slows scanning.
- **Safer alternative:** use sentence case for body copy; reserve all-caps for short labels only when the style is part of a deliberate system.
- **Applicability note:** acceptable for brief tokens like badges or section tags, not for paragraphs.

### Wide letter-spacing on body text

- **Why it is a problem:** excessive tracking makes running text harder to read and weakens word recognition.
- **Safer alternative:** keep body tracking neutral and let size, weight, and line length do the work.
- **Applicability note:** acceptable only for short display labels or highly intentional brand treatments.

### One font treatment everywhere

- **Why it is a problem:** using the same size/weight/style for every text role flattens hierarchy and hides structure.
- **Safer alternative:** assign distinct styles for headings, body, labels, and metadata so the page reads in layers.
- **Applicability note:** acceptable on very small surfaces with one text role; otherwise it usually signals under-designed hierarchy.
