---
description: Generate a focused session-continuation prompt for pasting into a fresh OpenCode window
---

Arguments (optional): `$ARGUMENTS`

- A path to a specific ledger file to read. If omitted, the most recent `tmp/ledger-*.md` file in the current worktree root is used automatically.

You are generating a handoff prompt for session continuation. The output is a structured prompt — not a log — designed to be pasted directly into a new OpenCode session to resume the current work seamlessly.

## Step 1: Locate and read the ledger

1. If `$ARGUMENTS` is provided and non-empty, treat it as the ledger file path and read that file.
2. Otherwise, list files matching `tmp/ledger-*.md` in the current worktree root, sort by name descending, and read the most recent one.
3. If no ledger file is found:
   - Print: `No ledger found in tmp/. Run /ledger first to capture session state, then re-run /handoff.`
   - Stop. Do not generate a handoff prompt from memory alone.

## Step 1a: Identify related artifacts

Using the ledger and current branch context, identify any relevant `tmp/context-*.md`, `tmp/test-plan-*.md`, or `tmp/debug-*.md` artifacts that the next session should consume or update.

- Prefer artifacts that match the active issue ID or branch topic.
- When multiple artifacts match, prefer exact issue ID match first, then exact branch-topic match, then the most recently modified artifact.
- If none are relevant, carry that forward explicitly instead of inventing one.

## Step 2: Generate the handoff prompt

Using the ledger content as the authoritative source of truth (supplemented by your current context where the ledger is silent), print the handoff prompt inline (do not write it to a file). Target ~300 tokens — dense and actionable, not a transcript.

Format the handoff prompt as follows:

---

**Handoff — {brief topic} — {date}**

**Resume goal:** {1 sentence: what we are trying to accomplish}

**Done so far:**
{bullet list of completed steps — be specific, include file names}

**Remaining:**
{bullet list of next steps not yet done}

**Artifacts consumed:**
{list relevant `tmp/` artifacts already used in this work, or "None"}

**Artifacts to update next:**
{list relevant `tmp/` artifacts that should be refreshed next session, or "None"}

**Key files touched:**
{list of files created/modified, one line each}

**Decisions made:**
{bullet list of non-obvious choices, with brief rationale — skip obvious ones}

**Blockers:**
{any issues blocking progress, or "None"}

**Linear issues:**
{list open issue IDs and titles, or "None" for non-Linear work}

**To resume:** {if there is an issue ID: `Fetch {issue ID} via `linear issue show {issue ID} --json`, then read the files and artifacts listed above`; otherwise: `Read the files and artifacts listed above`} and continue from: {single most important next step}

---

After printing the handoff prompt, add a one-line note: "Paste the above into a new OpenCode session to resume."
