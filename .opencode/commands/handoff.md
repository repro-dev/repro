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

**Key files touched:**
{list of files created/modified, one line each}

**Decisions made:**
{bullet list of non-obvious choices, with brief rationale — skip obvious ones}

**Blockers:**
{any issues blocking progress, or "None"}

**Linear issues:**
{list open issue IDs and titles, e.g. REP-123 — Add auth flow}

**To resume:** Fetch {issue ID} via `linear issue show {issue ID} --json`, read the files listed above, and continue from: {single most important next step}

---

After printing the handoff prompt, add a one-line note: "Paste the above into a new OpenCode session to resume."
