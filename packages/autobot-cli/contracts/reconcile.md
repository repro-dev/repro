# Autobot phase contract — reconcile

## Load before work
- Load `delivery-workflow` and `implementation-rigor` before reconciling.
- `delivery-workflow`
- `implementation-rigor`

## Inputs
- implementation outcome
- verification evidence
- `run-plan.md`
- review output and fix-loop status

## Responsibilities
- Compare the completed work against the planned contract.
- Read the implementation outcome, verification evidence.
- Decide whether the issue is complete, needs another fix pass, or must be escalated.
- Ensure artifacts and status reflect the real outcome.
- Reconcile the run state and decide whether the issue is complete.
- Do not mark complete when review has unresolved blockers.
- Preserve events, logs, and artifacts; reconciliation must not erase history.
- Report ambiguous state with exact mismatch and recovery commands.

## Output
- reconciliation summary
- `.autobot/runs/<issue-id>/attempt-<attempt>/reconcile.md`
- completion or escalation decision
