---
description: Reconcile repro.pen design deltas against implementation — detect the pen-contract candidate inventory, judge relevance to the current issue, apply in-vocabulary overrides as component props, and record the applied manifest
---

Arguments (optional): `$ARGUMENTS`

- Pass an optional Linear issue ID (`REP-123`) to anchor relevance judgment.
- No flags. Detection is agentic by design (REP-1628).

## Command contract

1. If `$ARGUMENTS` is empty, run the reconcile without a relevance anchor (issue-agnostic mode).
2. If `$ARGUMENTS` matches `REP-\d+`, fetch the issue context via `linear issue show <id> --json` before Detect, and use it as the relevance anchor in the Judge phase.
3. Load `pen-reconcile`.
4. Run Detect → Judge → Decide → Apply → Record:
   - **Detect**: `pnpm run pen:contract` (capture JSON to `tmp/`), build the candidate inventory.
   - **Judge**: match candidates to the issue scope; out-of-scope candidates are explicitly deferred.
   - **Decide**: surface the inventory via the `question` tool — apply all / apply subset / defer / skip — and apply the selection.
   - **Apply**: translate in-vocabulary overrides via the closed vocabulary; patch existing behavioral components (never regenerate); output a code-only reviewable diff plus the deferred-items list.
   - **Record**: write the applied manifest to `tmp/pen-applied.json`.
5. Keep `/pen-reconcile` thin — the operating logic lives in the `pen-reconcile` skill; this file only defines the entrypoint.
