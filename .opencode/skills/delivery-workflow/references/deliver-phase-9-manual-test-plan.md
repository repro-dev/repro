## Phase 9: Emit manual test plan (post-publish, non-blocking)

After Phase 8 publish completes for all publishable issues, produce a manual test plan artifact for each one. This phase runs **after** the PR is created and does **not** block publish. It is a final informational output step.

### Per-issue workflow

For each issue that was published in this run:

1. **Gather inputs**:
   - The Linear issue description and acceptance criteria (`linear issue show <issue-id> --json`)
   - The implementation diff (`git diff main...HEAD` in the worktree)
   - The review findings from Phase 7 (both blockers resolved and non-blockers swept)
   - The `tmp/context-<issue-id>.md` artifact if one exists (for UI design direction, targeted edits, etc.)

2. **Derive manual verification steps** from those inputs:
   - Map each acceptance criterion to one or more concrete manual steps
   - For UI changes: reference relevant design-system patterns; each step describes a concrete interaction (e.g. "navigate to the settings page, click the toggle, confirm the label changes")
   - For API changes: include `curl` examples or equivalent for manual endpoint testing
   - For cross-cutting changes: group steps by user-facing surface (browser, CLI, API, extension)

3. **Scope the plan to human-executable verification only**:
   - Do **not** restate automated test names or describe what the test suite covers
   - Do **not** include steps that are fully covered by automated tests unless a human should still verify the integrated behavior
   - Each step must describe a concrete action and the expected outcome

4. **If the issue has no meaningful manual verification surface** (e.g. purely internal refactoring, build config changes):
   - The plan is a single line: `Automated coverage is sufficient; no manual verification needed.`
   - Still write the artifact — the presence of the file signals that the phase ran.

5. **Write the artifact** at `<absolute-worktree-path>/tmp/manual-test-plan-<issue-id>.md` using this structure:

   ```markdown
   # Manual Test Plan — [issue-id]: [issue-title]

   ## Acceptance criteria coverage

   <!-- One subsection per acceptance criterion, with concrete steps -->

   ### [Criterion summary]

   1. [Action]: [Expected outcome]
   2. [Action]: [Expected outcome]

   ## Additional verification (from review / diff)

   <!-- Steps surfaced by review findings or diff inspection that go beyond the stated AC -->
   <!-- Omit this section if there are none -->

   1. [Action]: [Expected outcome]

   ## Notes

   <!-- Anything the tester should know: preconditions, data setup, known limitations -->
   ```

### Operator output

After writing the artifact for each issue, emit the plan to the operator in the publish-phase summary output:

```
─────────────────────────────────────────────────────
📋 Manual test plan for REP-xxx
─────────────────────────────────────────────────────

[Full plan content, or a summary with path to the file]
```

If the artifact is more than ~40 lines, show a condensed summary (step count + section headers) and the path to the full file instead of the full content.

### PR body update

After writing the artifact, update the PR body to include a reference:

```
## Manual test plan

See `tmp/manual-test-plan-<issue-id>.md` in the branch.
```

Append this section after the Review remainder section already produced in Phase 8. If the plan says automated coverage is sufficient, include that note instead.

Use `gh pr edit <issue-id> --body "<updated-body>"` to update the PR description.

### Post-phase handoff

After all manual test plans are written and the PR bodies are updated:

- Report the artifact paths in the final summary
- Proceed to the existing post-publish stop and `/ledger` handoff (from Phase 8)

---
