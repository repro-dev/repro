# PR Delivery Worktree Identity Design

**Issue:** REP-1693
**Status:** Design and implementation plan approved by user on 2026-09-23

## Intent

`deliver --pr <number>` must give each GitHub PR its own isolated worktree and Herdr workspace, including when multiple PRs share an issue ID or source branch. Existing exact-head worktrees should remain reusable, user files must not be changed, and concurrent invocations must not exchange fetched commits or produce duplicate workspace opens.

## Requirements

1. A PR number is the stable identity for its delivery worktree path. Issue ID remains workspace label/prompt context and must not affect the path.
2. Two different PR numbers never adopt the same worktree, even when their source branch and fetched commit are identical.
3. The primary checkout is never adopted as a PR worktree.
4. An existing worktree can be adopted only when its PR ownership is compatible and its branch identity is either the PR source branch or a local alias already assigned to that PR, with HEAD matching the fetched PR head.
5. If a source branch is already owned by another PR, create a PR-specific local alias branch at the fetched commit. Do not push the alias or alter the existing worktree.
6. Legacy exact-head worktrees without ownership metadata can be claimed by the first matching PR without changing tracked or untracked working files. Later PRs with the same source branch use aliases.
7. Serialize PR worktree discovery, legacy ownership claims, and creation by source branch in shared Git metadata. Never adopt a `git worktree add` registration while its checkout is still in progress, including after its delivery-shell owner dies but the Git child remains active.
8. Concurrent same-PR worktree creation losers recover only by validating and adopting the completed exact-head isolated winner.
9. The fetch result is held in invocation-specific Git state until setup succeeds, then cleaned on success and failure.
10. Serialize Herdr's list/open sequence per worktree path. A waiting invocation rechecks the list after acquiring the lock and reuses the registered workspace instead of issuing a duplicate open.
11. If ownership, ref, worktree, or lock state cannot be validated safely, fail before launching the agent.

## Proposed Design

### PR/worktree ownership

- Use only `pr-<number>` as the PR-mode worktree slug. Keep the Herdr label and seeded command based on the issue ID when present; otherwise keep the `pr-<number>` label. Updating issue context must not change the PR worktree path.
- Store the owning PR number in metadata under the worktree's Git directory, not in the worktree contents. Claim an unowned legacy exact-head worktree atomically. Existing ownership for the same PR permits reuse; ownership for a different PR requires a new PR-specific alias branch/worktree.
- Hold a source-branch-keyed lock in the shared Git directory from worktree discovery through creation/adoption and ownership publication. This prevents another `deliver --pr` process from seeing the Git registration before `git worktree add` has completed checkout. After the lock is acquired, re-scan and make the ownership/alias decision from current state.
- Treat Git's `locked initializing` worktree state or a relevant source/PR-alias worktree's private `index.lock` as an active checkout even if the source-lock owner process has died. Relevance is limited to the requested source branch, the target PR path, or a PR alias whose collision-resistant source-branch suffix matches; unrelated worktrees must not block this delivery. While holding the source lock, inspect the worktree registry and wait for at most 1,200 polling attempts (50 ms intervals, plus Git inspection time); fail closed if the state is unverifiable or does not clear. Do not claim ownership, alter Git's marker/index lock, or open Herdr while Git is still populating the worktree.
- Derive the alias branch from the PR number and sanitized source branch plus a stable digest of the full source branch name. The digest prevents two distinct refs with the same sanitized slug from colliding. The alias points at the fetched commit and is local-only; the source branch and remote PR branch remain unchanged.
- Use a per-invocation ref for the fetched PR head. Retain it until the target branch/worktree is validated or created, then remove it. An exit cleanup handles earlier failures.
- Keep the existing attached worktree untouched: no reset, clean, checkout, or tracked/untracked file changes.

### Concurrent creation recovery

After a fresh `git worktree add -b` fails, re-read the local source branch and worktree registry while holding the source-branch lock. Recover only after the competing `git worktree add` has exited and the branch OID and attached worktree HEAD equal the fetched PR OID, the worktree is isolated from `MAIN_CHECKOUT`, and ownership resolves to the current PR. Every other state fails closed without opening Herdr.

### Herdr workspace serialization

- Add a local per-path lock around the existing-workspace lookup and possible `herdr worktree open` call. Resolve equivalent path spellings to one lock identity.
- Use a filesystem primitive available on macOS Bash 3.2 environments. The lock records its owning process with a timezone/locale-stable process-start identity (`ps` queried with `TZ=UTC LC_ALL=C`), releases on normal exit/signals, and stale-owner recovery is conservative; an unverified lock is a clear failure rather than permission to race the open.
- Keep the per-path kernel advisory gate held for the full `herdr worktree open` child lifetime. A stale-lock reaper must wait for that gate before reclaiming the filesystem lock, so a killed delivery shell cannot cause a second open while the original Herdr child is still running.
- Install cleanup traps before acquisition and publish the current lock identity/token before the atomic owner record becomes visible, so signals at the acquisition boundary can safely release only the caller's own lock.
- Recheck Herdr's workspace list after acquiring the lock. Keep the lock only through lookup/open; agent launch occurs after release.

## Failure behavior

- A branch/head mismatch, foreign PR ownership, primary-checkout collision, failed alias creation, stale/unverifiable lock, or failed worktree verification reports the affected PR and stops before Herdr/agent launch.
- A failed Herdr list remains fail-open only when the per-path lock is held; it may issue the open request once for that serialized attempt, preserving current daemon-recovery behavior.
- Temporary fetch refs and locks are cleaned on normal and error exits where safe. Stale state must never cause destructive cleanup of another live invocation's resources.

## Test Plan

- Two PR numbers with the same source branch and commit: first claims/adopts the legacy worktree; second gets a distinct alias branch and worktree; both heads match and neither changes remote source branch.
- Two PR numbers with the same issue ID but different source branches/heads: worktree paths remain distinct while labels/prompts retain the issue ID.
- Same-PR concurrent fresh creation: the loser adopts only the exact-head winner; wrong branch, wrong head, or primary-checkout winner is rejected.
- Different-PR concurrent creation: pause the first `git worktree add` during checkout after Git has registered the branch and HEAD; the second delivery must wait, then observe the completed first owner and create its own local alias.
- Owner-shell death during checkout: kill the delivery shell while its Git checkout child remains blocked; a waiter must detect Git's initializing/index-lock state, refrain from ownership/Herdr/agent launch, and proceed only after checkout completes.
- An unrelated source branch or unrelated PR alias marked initializing must not block an independent PR delivery.
- Distinct source refs that sanitize to the same branch slug still produce distinct alias refs; an unrelated alias with a colliding old slug does not block or get adopted.
- Kill the delivery shell while the Herdr-open child is held; a second delivery must not open again until the first Herdr process releases its per-path advisory gate, then must reuse the registered workspace.
- Deliver a signal after an atomic filesystem lock is installed but before acquisition returns; cleanup removes only that lock and preserves the fetch-ref EXIT trap.
- Same PR with changed issue context: dry-run path stays identical while workspace label/prompt context reflects the changed issue ID.
- Same lock owner queried under different `TZ` values retains the same process-incarnation identity and never triggers live-lock reclamation.
- Concurrent same-PR Herdr lookup/open: a deterministic barrier proves only one `worktree open` request is sent and the waiter reuses the first workspace.
- Retain existing tests for fetch interleaving, temp-ref cleanup, exact-head content preservation, issue-ID precedence, and fresh branch push.
- Run `bash scripts/lib/tests/test_deliver.sh`, `bash -n scripts/deliver.sh scripts/lib/worktree.sh scripts/lib/tests/test_deliver.sh`, and `git diff --check`.

## Scope and Non-goals

This design changes the existing `deliver --pr` path and its shared Herdr workspace helper. It does not alter issue-mode worktree naming, remote PR branches, workspace labels, or user worktree contents. No UI, database, network service, or external dependency changes are involved.

## Risks

- Git-local ownership metadata needs an atomic claim/read rule so simultaneous different PRs cannot both claim one legacy worktree.
- Alias branch creation and worktree registration must be coordinated with the current invocation-specific fetch ref and branch-push behavior.
- Lock cleanup after forced termination must fail safely without stealing a live lock or indefinitely blocking future deliveries.
