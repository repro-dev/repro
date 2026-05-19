# Autobot phase contract — risk-assess

## Purpose
Assess post-plan implementation risk and select the review lane set.

## Load before work
- Load `delivery-workflow` and `review-standards` before assessing risk.
- `delivery-workflow`
- `review-standards`

## Inputs
- `run-plan.md`
- classify output with `issue_shapes`
- `context.md`
- `test-plan.md`
- Linear issue details when risk signals are ambiguous

## Responsibilities
- Read the approved `run-plan.md` after planning is complete.
- Derive risk only from post-plan evidence: `## Sequence Notes`, `## Risk Notes`, listed file/package counts, and implementation steps.
- Read `issue_shapes` from classify output as a shape signal, not as the source of `risk_level`.
- Set `risk_level: high` when two or more risk signals are present.
- Set `risk_level: standard` when fewer than two risk signals are present.
- Select review lanes from `risk_level` and `issue_shapes`.
- Record which concrete plan lines or issue-shape signals triggered each selected lane.
- Do not change the implementation plan.

## Risk rubric
- Security-sensitive: touches auth, permissions, tokens, encryption, or user data models.
- Data model: includes schema, migration, or database-operation changes.
- Multi-service: lists files across three or more packages or services.
- High file count: lists ten or more files to write or modify.
- Large diff: `## Risk Notes` identifies a large diff or more than 15 planned file edits.
- UI-bearing: `issue_shapes` includes `ui-bearing`; this adds UI review routing but is not high risk by itself.

## Review routing
- Always include `review-standard`.
- Include `review-correctness-security` when `risk_level: high` or security-sensitive signals are present.
- Include `review-architecture-conventions` when multi-service, shared-package, or convention-sensitive signals are present.
- Include `review-performance` when data model, database-operation, algorithmic, pagination, or latency signals are present.
- Include `review-ui-quality` when `issue_shapes` includes `ui-bearing`.

## Output
- `risk-assessment.md`
- `## Risk Level`
- `## Risk Signals`
- `## Review Lanes`
- `## Why`
