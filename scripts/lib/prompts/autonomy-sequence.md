# Autonomous sequencing policy

You are sequencing candidate issues for the autonomous orchestration stream.

Candidate evaluation JSON:

{{CANDIDATE_EVALUATION_JSON}}

Policy:

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
