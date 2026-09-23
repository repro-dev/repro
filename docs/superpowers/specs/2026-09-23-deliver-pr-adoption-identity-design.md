# PR Delivery Worktree Identity Design

**Issue:** REP-1693
**Status:** Design and implementation plan approved by user on 2026-09-23

## Intent

`deliver --pr <number>` must give each GitHub PR its own isolated worktree and Herdr workspace, including when multiple PRs share an issue ID or source branch. Existing exact-head worktrees should remain reusable, user files must not be changed, and concurrent invocations must not exchange fetched commits or produce duplicate workspace opens.

## Requirements

1. A PR number is the stable identity for its delivery worktree. Issue ID remains workspace label/prompt context, not worktree identity.
2. Two different PR numbers never adopt the same worktree, even when their source branch and fetched commit are identical.
3. The primary checkout is never adopted as a PR worktree.
4. An existing worktree can be adopted only when its PR ownership is compatible and its branch identity is either the PR source branch or a local alias already assigned to that PR, with HEAD matching the fetched PR head.
5. If a source branch is already owned by another PR, create a PR-specific local alias branch at the fetched commit. Do not push the alias or alter the existing worktree.
6. Legacy exact-head worktrees without ownership metadata can be claimed by the first matching PR without changing tracked or untracked working files. Later PRs with the same source branch use aliases.
7. Concurrent same-PR worktree creation losers recover only by validating and adopting the exact-head isolated winner.
8. The fetch result is held in invocation-specific Git state until setup succeeds, then cleaned on success and failure.
9. Serialize Herdr's list/open sequence per worktree path. A waiting invocation rechecks the list after acquiring the lock and reuses the registered workspace instead of issuing a duplicate open.
10. If ownership, ref, worktree, or lock state cannot be validated safely, fail before launching the agent.

## Proposed Design

### PR/worktree ownership

- Include the PR number in every PR-mode worktree slug. Keep the Herdr label and seeded command based on the issue ID when present; otherwise keep the `pr-<number>` label.
- Store the owning PR number in metadata under the worktree's Git directory, not in the worktree contents. Claim an unowned legacy exact-head worktree atomically. Existing ownership for the same PR permits reuse; ownership for a different PR requires a new PR-specific alias branch/worktree.
- Derive the alias branch from the PR number and sanitized source branch. The alias points at the fetched commit and is local-only; the source branch and remote PR branch remain unchanged.
- Use a per-invocation ref for the fetched PR head. Retain it until the target branch/worktree is validated or created, then remove it. An exit cleanup handles earlier failures.
- Keep the existing attached worktree untouched: no reset, clean, checkout, or tracked/untracked file changes.

### Concurrent creation recovery

After a fresh `git worktree add -b` fails, re-read the local source branch and worktree registry. Recover only if the branch OID and attached worktree HEAD equal the fetched PR OID, the worktree is isolated from `MAIN_CHECKOUT`, and ownership resolves to the current PR. Every other state fails closed without opening Herdr.

### Herdr workspace serialization

- Add a local per-path lock around the existing-workspace lookup and possible `herdr worktree open` call. Resolve equivalent path spellings to one lock identity.
- Use a filesystem primitive available on macOS Bash 3.2 environments. The lock records its owning process, releases on normal exit/signals, and stale-owner recovery is conservative; an unverified lock is a clear failure rather than permission to race the open.
- Recheck Herdr's workspace list after acquiring the lock. Keep the lock only through lookup/open; agent launch occurs after release.

## Failure behavior

- A branch/head mismatch, foreign PR ownership, primary-checkout collision, failed alias creation, stale/unverifiable lock, or failed worktree verification reports the affected PR and stops before Herdr/agent launch.
- A failed Herdr list remains fail-open only when the per-path lock is held; it may issue the open request once for that serialized attempt, preserving current daemon-recovery behavior.
- Temporary fetch refs and locks are cleaned on normal and error exits where safe. Stale state must never cause destructive cleanup of another live invocation's resources.

## Test Plan

- Two PR numbers with the same source branch and commit: first claims/adopts the legacy worktree; second gets a distinct alias branch and worktree; both heads match and neither changes remote source branch.
- Two PR numbers with the same issue ID but different source branches/heads: worktree paths remain distinct while labels/prompts retain the issue ID.
- Same-PR concurrent fresh creation: the loser adopts only the exact-head winner; wrong branch, wrong head, or primary-checkout winner is rejected.
- Concurrent same-PR Herdr lookup/open: a deterministic barrier proves only one `worktree open` request is sent and the waiter reuses the first workspace.
- Retain existing tests for fetch interleaving, temp-ref cleanup, exact-head content preservation, issue-ID precedence, and fresh branch push.
- Run `bash scripts/lib/tests/test_deliver.sh`, `bash -n scripts/deliver.sh scripts/lib/worktree.sh scripts/lib/tests/test_deliver.sh`, and `git diff --check`.

## Scope and Non-goals

This design changes the existing `deliver --pr` path and its shared Herdr workspace helper. It does not alter issue-mode worktree naming, remote PR branches, workspace labels, or user worktree contents. No UI, database, network service, or external dependency changes are involved.

## Risks

- Git-local ownership metadata needs an atomic claim/read rule so simultaneous different PRs cannot both claim one legacy worktree.
- Alias branch creation and worktree registration must be coordinated with the current invocation-specific fetch ref and branch-push behavior.
- Lock cleanup after forced termination must fail safely without stealing a live lock or indefinitely blocking future deliveries.
