---
name: quiz
description: Post-delivery self-review quiz — active recall on delivered changes using Linear issue, git diff, and tmp/ artifacts
---

# Quiz Skill

Use this skill after a delivery session to reinforce understanding through active recall. Invoked via `/quiz` or loaded manually when `$ARGUMENTS` is provided.

## When to use

After completing a `/deliver` or `/deliver-issue` session, run `/quiz` to self-test on what was delivered. The quiz is a read-only activity — no files are created or modified.

## Phase 1 — Gather source material

Collect all available evidence about the delivered change before generating questions.

### 1. Identify the target

The command may provide an `issueId` (REP-NNN), a `prNumber` (digits), or neither. Determine the mode:

- **Issue mode**: `issueId` provided, or detected from branch name. Use local git + Linear + tmp/ artifacts.
- **PR mode**: `prNumber` provided. Use `gh` CLI to fetch PR details and diff. tmp/ artifacts are not available locally — skip artifact-dependent categories.

If neither mode applies (no issue ID, no PR number, and no branch match), ask: "Which issue or PR do you want to quiz on? (e.g., REP-123 or 1234)"

### 2. Issue mode — gather local context

#### 2a. Detect Linear issue ID

If an issue ID was already provided via the command (e.g. `/quiz REP-1430`), use it directly and skip the detection steps below.

Otherwise, run `git branch --show-current` and extract the first match of `REP-\d+`.

- If no match found, use the `question` tool: "Which issue did you just deliver? (e.g., REP-123)"
- If the user provides a blank answer, proceed with whatever source material is available and skip issue-based question categories.

#### 2b. Fetch Linear issue

Run `linear issue show <id> --json` to get the issue title, description, and labels.

- If the `linear` CLI is unavailable or the command fails, log the gap and skip issue-specific questions.
- The description text feeds design-decision and requirements questions.

#### 2c. Compute git diff

Determine the merge base against `main`, then inspect the diff:

```
git merge-base main HEAD
git diff <merge-base>..HEAD --stat
git diff <merge-base>..HEAD
```

- Truncate the full diff to approximately 20,000 characters if too large.
- If not in a git repo, or if `main` has no merge-base relationship with HEAD, skip diff-based questions.

#### 2d. Read tmp/ artifacts

Attempt to read each of these files (they may not exist):

- `tmp/context-<id>.md` — design direction, context, decisions
- `tmp/test-plan-<id>.md` — test strategy, edge cases, gaps
- `tmp/plan-<id>.md` — implementation plan, sequence, risk notes

Track which files were found and which were missing. Missing artifacts cause the corresponding question category to be skipped.

#### 2e. Check for review findings

Ask the user: "Did you receive any review comments or feedback on this delivery?" If yes, incorporate the topics into question generation.

### 3. PR mode — gather remote context

When quizzing on someone else's PR, fetch everything from GitHub. No local branch or tmp/ artifacts are expected.

#### 3a. Fetch PR details

```
gh pr view <number> --json title,body,headRefName,baseRefName,state,author
```

- The PR title and body provide context analogous to a Linear issue description.
- Extract the Linear issue ID from the PR body if present (e.g. "Closes REP-xxx", "Fixes REP-xxx"). If found, also fetch the issue via `linear issue show <id> --json`.

#### 3b. Fetch PR diff

```
gh pr diff <number>
```

- Truncate to approximately 20,000 characters if too large.
- If `gh` is unavailable or the command fails, skip diff-based questions.

#### 3c. Skip artifact-dependent categories

No local tmp/ artifacts are available for a remote PR. Skip test-coverage questions unless the PR diff includes test file changes (use those as limited evidence). Note the skip in the summary.

## Phase 2 — Determine question count

Count changed files, insertions, and deletions from `git diff --stat`. Use the larger dimension (files or lines) to pick the tier:

| Change size | Files | Lines changed | Questions |
|---|---|---|---|
| Trivial | < 5 | < 50 | 3–5 |
| Medium | 5–15 | 50–300 | 8–12 |
| Major | > 15 | > 300 | 15–25 |

If diff data is unavailable (no git repo, no merge base), default to 8–10 questions.

## Phase 3 — Generate questions

Draw from available source material across these categories. Skip any category where the source material is insufficient.

### Categories

| Category | What to ask about | Source |
|---|---|---|
| Architecture / structure | Which files changed, package relationships, data flow, module boundaries | git diff, context artifact |
| Design decisions / tradeoffs | Why this approach was chosen, alternatives considered, known limitations | Linear issue, context artifact, plan |
| Code specifics | Function contracts, parameters, types, key implementation details, naming | git diff (full), plan |
| Test coverage | What was tested, edge cases covered, untested gaps, test strategy | test-plan artifact, diff of test files |
| Edge cases / error handling | Failure modes, boundary conditions, error paths, defensive checks | git diff, plan, test-plan |

### Format rules

- **Multiple-choice** (use `question` tool with `question` + `options`): For concrete details — function names, file paths, specific values, parameter types. Use `multiple: false` for single-select.
- **Free-text** (print the question, wait for user response): For understanding — design rationale, tradeoff analysis, conceptual understanding.
- Aim for roughly 60% multiple-choice, 40% free-text, adjusted based on available material.
- Shuffle both the question order and the answer options within each multiple-choice question. Never present the correct answer as the first option more than once consecutively.

## Phase 4 — Quiz loop

Present questions one at a time. Do not reveal the next question until the current one is answered.

### For multiple-choice questions

1. Configure: `question` tool with `header`, `question` string, `options` array, and `multiple: false`.
3. After the user answers, evaluate against the known correct answer chosen during generation.
4. Print: "Correct!" or "Incorrect." followed by the correct answer and a brief explanation tied to the source material.
5. Score: 1 point for correct, 0 for incorrect.

### For free-text questions

1. Print the question as plain text directly in the conversation.
2. Wait for the user's text response.
3. Evaluate using tolerance heuristics:
   - The answer must mention key **concepts** present in the source material (exact wording not required).
   - Accept reasonable paraphrasing and synonyms.
   - Flag as wrong only when substantively incorrect, contradictory to the source, or missing **all** critical facts.
   - If ambiguous or partially correct, score as 0.5 and note the nuance in the reveal.
   - If the user provides a blank or minimal (1-3 word) answer, score 0.
4. Print the correct answer after evaluation, with a brief explanation tied to the source material.
5. Score: 1 point for fully correct, 0.5 for partially correct, 0 for incorrect or blank.

### Tracking

Maintain ephemeral state:
- `currentScore` (float, accumulates points)
- `totalQuestions` (integer)
- `perCategoryScore` — map of category name -> { points, total }

## Phase 5 — End-of-quiz summary

After the last question, print:

=== Quiz Summary ===
Score: X/Y (Z%)
Strong areas: <categories where ≥80% score>
Weak areas: <categories where <60% score>

Tip: <suggested review material>

### Strong/weak logic

- Compute per-category percentage: `category.points / category.total`.
- Categories with 0 questions attempted should not appear in strong/weak areas.
- Round percentages to the nearest whole number.

### Tip generation

| Weak area | Suggested review |
|---|---|
| Architecture | Re-read the diff overview and any context artifact. |
| Design decisions | Re-read the Linear issue description and the plan artifact. |
| Code specifics | Re-read the affected files in the diff. |
| Test coverage | Re-read the test plan artifact and the test files in the diff. |
| Edge cases / error handling | Re-read the plan's risk notes and the error-handling sections of the diff. |

If all categories are strong (≥80%), print: "Great recall! Consider peer-reviewing another team member's delivery to reinforce your understanding."

If all categories are weak (<60%), print: "Consider re-reading the full diff and plan artifact, then re-running /quiz."

## Graceful degradation

| Condition | Behavior |
|---|---|
| No Linear ID in branch | Ask user via `question` tool |
| `linear` CLI unavailable | Skip issue-based categories; note in summary |
| `gh` CLI unavailable (PR mode) | Skip PR diff; fall back to issue description only if a Linear ID was extracted from PR body |
| Not in a git repo | Skip diff-based categories; note in summary |
| tmp/ artifacts missing | Skip categories that depend on them; note in summary |
| PR mode (remote PR, no local branch) | Skip test-coverage questions unless PR diff includes test file changes |
| Diff very large (>500 lines changed) | Use `--stat` only; generate fewer code-specific questions (~half the usual count) |
| User provides blank answer to free-text | Score 0, reveal answer |
| No source material available at all | Print "No source material available. Cannot generate quiz." and exit |

## Read-only constraint

This skill must never create, modify, or delete any files. All state (score, current question index, answers) is ephemeral within the conversation. The quiz is a read-only session activity.
