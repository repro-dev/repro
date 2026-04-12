---
description: Generate a focused session-continuation prompt for pasting into a fresh OpenCode window
---

You are generating a handoff prompt for session continuation. The output is a structured prompt — not a log — designed to be pasted directly into a new OpenCode session to resume the current work seamlessly.

Print the handoff prompt inline (do not write it to a file). Target ~300 tokens — dense and actionable, not a transcript.

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

**To resume:** Fetch {issue ID} via Linear_get_issue, read the files listed above, and continue from: {single most important next step}

---

After printing the handoff prompt, add a one-line note: "Paste the above into a new OpenCode session to resume."
