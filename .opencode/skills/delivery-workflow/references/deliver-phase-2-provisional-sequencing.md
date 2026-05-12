## Phase 2: Provisional sequencing

Run this phase only when `mode = wave`.

1. Group the selected issues into **provisional** waves using likely file independence and dependency order.
2. When in doubt, separate issues into different waves.
3. Display the provisional wave plan and why each issue is in that wave.

Example:

```
Wave 1: REP-101, REP-102
  - Independent file areas

Wave 2: REP-103
  - Depends on REP-101 landing first
```

Only the earliest ready wave will be implemented in this run. Later waves remain queued and should be reported at the end, not auto-started.

---
