# Autonomous sequencing policy

You are sequencing candidate issues for the autonomous orchestration stream.

Candidate evaluation JSON:

{{CANDIDATE_EVALUATION_JSON}}

Policy:

- Treat the candidate evaluation as a seed, not the full universe.
- If the seed is sparse, ambiguous, or low-confidence, expand context before finalizing waves.
- For promising candidates, fetch live Linear issue details and inspect blockers, child issues, comments, and related issues.
- Inspect relevant repo files and paths named in the issue text so wave selection reflects implementation reality.
- When overlap or dependency order is unclear, widen beyond the initial candidate slice and inspect nearby repo patterns.
- delegate to `librarian` for external docs or API behavior questions, and delegate to `context-gather` when the issue context is too thin to sequence safely.
- Sequence only eligible issues into waves.
- Keep blocked or deferred issues in the deferred list with a reason and a brief rationale.
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
