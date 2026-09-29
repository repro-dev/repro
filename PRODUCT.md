# Repro Product Context

> Hand-authored. Maintained by hand. No generator.
> Impeccable uses this file for product-aware design-quality heuristics.

## Register

product

## Users

People who own browser bug feedback—initially support leads, with product, design, and QA roles under evaluation—and the engineers who triage their reports. The initial company hypothesis is B2B SaaS; Europe is a founder-access choice, not a product claim. See `docs/product-mission-2026-09.md`.

## Product Purpose

Repro helps teams create high-quality reports about browser bugs, defects, and unexpected behavior using its own capture runtime. The browser extension is the low-friction first path; an embedded SDK/report UI follows for customer-submitted issues. A shared workspace connects reporting teammates and engineers around the same recording so support can route work and engineering can investigate it. The Extension MVP has three milestones: a Free report-to-investigation workflow that removes diagnosis from the extension; self-serve billing with exactly one paid offer and a deliberately low-friction, iterated price; and workspace-only Agentic diagnosis/debugging on saved recordings, designed afresh and tested for usefulness in real engineering work. Build and verify a cohesive, demo-ready MVP before founder-led organic outreach; no prospect quotas, deadlines, or parallel recruitment campaign are assumed. Only low-level Agentic tool definitions and turn-based streaming transport are candidates for reuse; Agentic usage limits remain TBD. Paid access is self-service, with no contact-sales-only tier or dedicated account management. Recordings include bounded HTTP request/response bodies; JSON object/array bodies receive best-effort redaction, while scalar JSON, non-JSON text, and binary bodies may remain unredacted. Fetch `text/event-stream` bodies are omitted while visible page updates remain in DOM playback. WebSocket connection lifecycle is recorded without frame payloads by default. Agent tools may inspect Repro-native evidence, but Repro does not claim to run or verify customer-side reproduction attempts or fixes. External links and metadata may add context; they do not become Repro recordings.

## Brand Personality

Precise, technical, and trustworthy. Not flashy or marketing-heavy. The product voice is direct, helpful, and respects the user's expertise. Design favors clarity, density, and information hierarchy over decorative flourish.

## Anti-references

- Overly playful or whimsical dev-tool UIs (the product is serious infrastructure)
- Marketing-heavy landing pages that hide the actual tool
- Cluttered dashboards with low information density
- AI-generated "slop" patterns: gradient text, nested cards, monotonous spacing, icon-tile stacks, em-dash overuse

## Design Principles

1. Clarity over decoration — every visual element must serve comprehension
2. Density with hierarchy — show relevant information; use spacing and type to establish what matters
3. Performance is a design feature — fast loading and responsive interactions are part of the experience
4. Authored, not generated — every surface must feel intentionally designed, not templated
5. Accessible by default — keyboard navigation, focus management, and screen-reader support are baseline

## Accessibility & Inclusion

Repro is a developer tool usable by developers with diverse needs: keyboard-only navigation, screen-reader compatibility, sufficient contrast, and responsive layout. Accessibility is part of the design principles, not an afterthought.
