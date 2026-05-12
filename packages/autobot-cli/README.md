# @repro/autobot-cli

TypeScript command surface for autobot operator and engine behavior.

## Ownership map
- Owns public command parsing, global flag forwarding, human/JSON rendering,
  and sqlite compatibility for package-local `.autobot/` state.
- Delegates phase/effect decisions and queue mutation policy to
  `@repro/autobot-engine`.

## Transitional notes
- Legacy `claims` / `runs` sqlite layouts are still read and migrated into the
  canonical `state` key/value table on demand.
- Shell wrappers remain thin shims while the TS CLI stays the primary surface.

## Final shape
- `state.sqlite` is canonical.
- CLI verbs stay stable; phase names remain explicit: `claim`,
  `prepare-worktree`, `prepare-context`, `plan`, `develop`, `test`, `review`,
  `release`, `recover`, `noop`.
