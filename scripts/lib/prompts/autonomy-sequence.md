# Autonomous sequencing policy

You are sequencing candidate issues for the autonomous orchestration stream.

Candidate evaluation JSON (full candidate pool after optional caller-driven project scope):

{{CANDIDATE_EVALUATION_JSON}}

Requested ready-issue cap after sequencing:

{{RESULT_LIMIT}}

Policy:

- Treat the candidate evaluation as the full pool to inspect for discovery and sequencing after any caller-driven project scope has been applied.
- Internal modes:
  - **discover only**: expand context and the candidate pool, but do not finalize wave ordering.
  - **sequence only**: keep the provided pool fixed and only order what is already present.
  - **discover+sequence**: the default; discover first when the pool is too narrow, then finalize waves.
- If the pool is sparse, ambiguous, or low-confidence, perform an initial discovery pass before finalizing waves.
- For promising candidates, fetch live Linear issue details and inspect blockers, child issues, comments, and related issues.
- Inspect relevant repo files and paths named in the issue text so wave selection reflects implementation reality.
- When overlap or dependency order is unclear, widen beyond the initial candidate slice and inspect nearby repo patterns.
- delegate to `librarian` for external docs or API behavior questions, and delegate to `context-gather` when the issue context is too thin to sequence safely.
- Sequence only eligible issues from the provided candidate evaluation into waves.
- Keep blocked or deferred issues in the deferred list with a reason and a brief rationale.
- Keep only the first ready issues up to the requested cap after sequencing.
- Use dependency order, file/package overlap, blocker notes, and wave composition.
- Do not launch agents.
- Do not mutate Linear.
- Do not invent issue identifiers.
- Return strict JSON only.

Return an object that matches this schema version: {{SCHEMA_VERSION}}

```json
{
  "schema_version": {{SCHEMA_VERSION}},
  "waves": [
    {
      "name": "wave-1",
      "issues": [
        {
          "issue_identifier": "REP-123",
          "rationale": "why this issue belongs here"
        }
      ],
      "rationale": "why this wave exists"
    }
  ],
  "deferred": [
    {
      "issue_identifier": "REP-456",
      "reason": "blocked-by:REP-123",
      "rationale": "why this was deferred"
    }
  ],
  "risk_notes": ["short notes"]
}
```
