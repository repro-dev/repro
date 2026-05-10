## Phase 5: Classify risk, resequence once using planner output, then lock

Do exactly one resequencing pass after planning in wave mode.

If `mode = single-track`, skip resequencing entirely. Classify risk for the issue, keep the singleton `current_ready_wave` unchanged, and continue.

### Risk classification (runs before resequencing)

For each issue with a completed plan, classify its risk profile using the planner's Sequence Notes and Risk Notes:

| Signal             | Detection                                                                     |
| ------------------ | ----------------------------------------------------------------------------- |
| Security-sensitive | Plan touches auth, permissions, tokens, encryption, or user data models       |
| Data model changes | Plan includes Prisma schema modifications, migrations, or database operations |
| Multi-service      | Plan's Sequence Notes list files across 3+ packages/services                  |
| High file count    | Plan lists 10+ files to write or modify                                       |

Classification rules:

- If 2+ signals are present: mark the issue as **high-risk**
- If fewer than 2 signals: mark as **standard**

Store the risk level alongside the issue in the status table for the rest of the run. The risk level drives reviewer spawning in Phase 7.

### Resequencing

Use the planner's **Sequence Notes** and **Risk Notes** (including the risk level just computed) to:

- Prune issues that are not ready
- Move issues to a later queued wave if planning revealed overlap or a missing dependency
- Detect shared-file conflicts: if two or more issues list the same file in their Sequence Notes, proceed if the planner output shows the edit locations are in distinct sections or line ranges of that file (git merge handles non-overlapping edits automatically). If a single file is listed by 3 or more issues without clear section isolation, move all but the highest-priority to a later wave. The orchestrator judges section isolation from the planner's Sequence Notes and the known structure of the target file (e.g., the phase-section structure of `deliver.md`).

  Example — the REP-884 wave (5 issues, all touching `deliver.md`):

  - REP-884 edits Phase 5 + Phase 7
  - REP-881 edits Phase 4 (Phase 4, lines 1–50)
  - REP-882 edits Phase 4 + Phase 7 + Phase 8 + agent template files (Phase 4, lines 60–120)
  - REP-880 edits Phase 6 + Phase 7 (Phase 7, lines 200–280)
  - REP-878 edits Phase 1

  The orchestrator scans for shared phases:

  - Phase 4 is touched by 2 issues (REP-881, REP-882) — edit locations are non-overlapping (lines 1–50 vs lines 60–120), so git merge can handle it; both can proceed
  - Phase 7 is touched by 3 issues (REP-884, REP-882, REP-880) — triggers the conservative 3+ rule, so keep highest-priority (REP-884) and defer REP-882 and REP-880 to a later wave
  - Phases 1, 5, 6, 8 are each touched by a single issue — no conflict

  Final wave: REP-884, REP-881, REP-878 proceed. REP-882 and REP-880 are deferred (later wave).

- Keep only the issues that are independently executable now in the **current ready wave**

After this pass, lock the wave plan for the rest of the run.

If the current ready wave becomes empty, stop and report why.

---
