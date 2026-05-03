# Persistence Hygiene & Decay Control

Use this companion when UI state, preferences, or experiments live long enough to drift across releases.

## Guardrails

- Preserve user preferences across updates and migrations; do not silently reset choices just because the stored shape changed.
- Version persisted state and migrate forward when the schema evolves; treat old data as compatibility work, not as discardable noise.
- Bound storage growth with explicit caps, expiry, or eviction so caches and saved UI state do not accumulate without limit.
- Remove stale flags, experiments, and dead toggles when they are no longer active; sunset them instead of leaving them to shape the UX forever.
- Keep durable preferences separate from temporary experiments so cleanup can happen without breaking the user’s saved intent.

## Named patterns

- **Preference-preserving update** — updates and migrations keep existing user choices intact.
- **Bounded storage** — saved UI data has an explicit ceiling or expiry path.
- **Stale-flag cleanup** — inactive flags and experiments are removed once they are no longer needed.
- **Compatibility migration** — old persisted shapes are upgraded instead of discarded.
- **Decayed-state purge** — obsolete cached UI state is cleaned out before it becomes UX bloat.

## Anti-patterns

- **Preference reset on update** — a release wipes out user choices without cause.
- **Storage bloat** — cached or persisted UI data grows without an eviction or expiry policy.
- **Zombie experiment** — a flag or A/B branch keeps influencing the UI after it should be retired.
- **State amnesia** — long-lived UI surfaces forget saved preferences after schema changes.
