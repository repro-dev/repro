---
description: Audit skill files for stale symbol references and dead file paths
---

Audit all skill files in `.opencode/skills/` against the current codebase index to surface stale symbol references and dead file paths. Produces a per-file breakdown, summary, and suggested fixes.

---

## Arguments (optional)

- `AUTONOMOUS=true` — run in non-interactive mode. Auto-fixes unambiguous stale references and files Platform issues for ambiguous ones. Never prompts. Use this when another autonomous command wants audit output without an approval pause.

When called directly via `/audit-skills` (without arguments), `AUTONOMOUS` defaults to `false` (interactive mode).

---

## Step 1: Resolve the Repo Index

Call `jcodemunch_resolve_repo` with the main checkout path (not a worktree — skill files live in the main checkout):

```
path: /Users/gary/Projects/repro-dev/repro
```

If `resolve_repo` returns no index for this path, index it first:

```
jcodemunch_index_folder
  path: /Users/gary/Projects/repro-dev/repro
  use_ai_summaries: true
```

Wait for indexing to complete before proceeding.

---

## Step 2: Run the Audit

Call `jcodemunch_audit_agent_config` with:

```
project_path: /Users/gary/Projects/repro-dev/repro
repo: <repo identifier returned by resolve_repo>
```

This cross-references all agent config files (CLAUDE.md, .cursorrules, skill files, etc.) against the index to find:

- **Stale symbol references**: function or class names that no longer exist in the codebase
- **Dead file paths**: paths mentioned in skill files that no longer exist on disk

---

## Step 3: Format Results

### If no stale references found

```
✅ Skill audit: clean

No stale symbol references or dead file paths found across all skill files.
All agent config files are up to date with the current codebase.
```

### If stale references found

Print a per-file breakdown:

```
## Skill Audit Results

### Per-File Breakdown

#### .opencode/skills/<name>/SKILL.md
- Stale references: N
  - `symbolName` (symbol) — referenced on line L, not found in current index
    Suggested replacement: `newSymbolName` in `src/path/to/file.ts` (from index search)
  - `src/old/path.ts` (file path) — path no longer exists
    Suggested replacement: `src/new/path.ts` (closest match by name)

#### .opencode/skills/<other>/SKILL.md
- Stale references: N
  ...

---

### Summary

| Metric | Count |
|--------|-------|
| Skill files scanned | N |
| Files with stale references | N |
| Total stale symbol references | N |
| Total dead file paths | N |

### Agent Impact

Which agents/commands load each affected skill file — populated dynamically in Step 4b by
scanning `.opencode/commands/*.md`, `.opencode/agents/*.md`, and `AGENTS.md`:

| Skill File | Loaded By | Impact |
|------------|-----------|--------|
| (populated by Step 4b scan) | | |
```

---

## Step 4: Find Suggested Replacements and Determine Agent Impact

### 4a: Find suggested replacements

For each stale reference where the audit does not provide a replacement, search the index:

- For stale **symbol names**: call `jcodemunch_search_symbols` with the stale name as query. The top result is the suggested replacement. If no results, note "no replacement found — may have been deleted".
- For stale **file paths**: call `jcodemunch_get_file_tree` with a `path_prefix` matching the directory portion of the stale path, or use the `glob` tool with a pattern like `**/<filename>` to locate files by name. If a matching file exists at a new path, that is the suggested replacement.

Include all suggestions in the per-file breakdown above.

**Classify each stale reference as unambiguous or ambiguous:**

- **Unambiguous**: `jcodemunch_search_symbols` returns exactly one result with an exact name match (the symbol was clearly renamed), OR for file paths, `glob` finds exactly one file matching the filename at a new path. Tag as `confidence: unambiguous`.
- **Ambiguous**: multiple candidates found with no clear best match, zero candidates found, or the top result has a substantially different signature or context suggesting deletion rather than rename. Tag as `confidence: ambiguous`.

### 4b: Determine which agents load each affected skill

For each affected skill file identified in the audit, scan these sources to find which agents and commands reference it:

1. Read all files in `.opencode/commands/*.md` — search for `skill` tool calls or text matching `load.*skill.*<skill-name>` or `` Load.*`<skill-name>` `` (case-insensitive, where `<skill-name>` is the directory name of the skill, e.g. `agentic`, `database`).
2. Read all files in `.opencode/agents/*.md` — same pattern.
3. Read `AGENTS.md` in the repo root — look for references to the skill name.

Populate the **Agent Impact** column in the summary table dynamically based on this scan. The format should be:

```
| .opencode/skills/<name>/SKILL.md | /deliver (develop agent), AGENTS.md | Agents get stale function names |
```

If no agent or command loads the skill, write `(none found)` in the Loaded By column.

---

## Step 5: Fix or Escalate

### 5a: Autonomous mode (`AUTONOMOUS=true`)

When called with `AUTONOMOUS=true`:

#### Auto-fix unambiguous references

For each stale reference tagged `confidence: unambiguous`:

1. Read the current skill file content.
2. Replace the stale symbol name or file path with the suggested replacement.
3. Write the updated file.
4. Call `jcodemunch_index_file` on the updated file to keep the index fresh.
5. Log: `Auto-fixed: <file>:<line> — replaced '<stale>' with '<replacement>'`

#### File Platform issues for ambiguous references

For each stale reference tagged `confidence: ambiguous`:

1. File a new Linear issue via the repo-owned `linear` CLI:

   `linear issue create --title "Stale skill reference: <skill-file> line <line> — could not auto-resolve '<stale-name>'" --project Platform --label "Tech Debt" --priority low --description "<structured markdown including Context, Details, and Action>"`

   The description should include:

   - **Context**: `An autonomous skill audit found a stale reference that could not be auto-resolved.`
   - **Details**: the stale reference (file path or symbol name), the skill file and line number, what candidates were found (if any), and why confidence was insufficient.
   - **Action**: `Manually verify whether this reference should be updated, removed, or is intentionally referencing something outside the index.`

2. Log: `Filed Platform issue <issue-ID>: ambiguous stale reference '<stale>' in <file>:<line>`

#### Re-audit and report

After all auto-fixes are applied, re-run `jcodemunch_audit_agent_config` to confirm no unambiguous references remain.

Print one of:

- `✅ Skill audit (autonomous): auto-fixed N references across M files, filed K ambiguous issues — now clean`
- `✅ Skill audit (autonomous): auto-fixed N references, K ambiguous references filed as Platform issues — proceeding`

**Never prompt the user. Always continue.**

### 5b: Interactive mode (`AUTONOMOUS=false`)

When called interactively (e.g. directly via `/audit-skills` without the autonomous flag):

> Would you like to fix the stale references now?
> Type **yes** to update the affected skill files in this session, or **no** to exit.

**If user says "yes":**

For each stale reference in each affected skill file:

1. Read the current skill file content.
2. Replace the stale symbol name or file path with the suggested replacement (or remove the reference entirely if no replacement was found and it's no longer relevant).
3. Write the updated file.
4. Call `jcodemunch_index_file` on the updated file to keep the index fresh.

After all fixes are applied, re-run `jcodemunch_audit_agent_config` to confirm the audit is now clean. Print the final result:

```
✅ Skill audit: fixed N references across M files — now clean
```

**If user says "no":**

```
Audit complete. N stale references remain unfixed.
To fix later, re-run /audit-skills.
```
