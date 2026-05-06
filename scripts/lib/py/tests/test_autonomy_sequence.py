"""Tests for autonomy_sequence.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_render_sequence_prompt_includes_candidate_json_and_schema_instructions():
    from autonomy_sequence import render_sequence_prompt

    template = """Sequencing policy
Schema version: {{SCHEMA_VERSION}}

Candidate evaluation:
{{CANDIDATE_EVALUATION_JSON}}

Requested ready-issue cap after sequencing:
{{RESULT_LIMIT}}

    Treat the candidate evaluation as the full candidate pool after optional caller-driven project scope.
Internal modes:
- discover only: expand context and the candidate pool, but do not finalize wave ordering.
- sequence only: keep the provided pool fixed and only order what is already present.
- discover+sequence: the default; discover first when the pool is too narrow, then finalize waves.
If the pool is sparse, ambiguous, or low-confidence, perform an initial discovery pass before finalizing waves.
For promising candidates, fetch live Linear issue details and inspect blockers, child issues, comments, and related issues.
delegate to `librarian` for external docs or API behavior questions, and delegate to `context-gather` when the issue context is too thin to sequence safely.

Return strict JSON only.
"""

    prompt = render_sequence_prompt(
        template,
        {
            "items": [
                {"issue_identifier": "REP-1", "eligible": True, "reasons": [], "notes": []},
            ],
            "summary": {"eligible_count": 1},
        },
        result_limit=5,
        schema_version=1,
    )

    assert '"issue_identifier": "REP-1"' in prompt
    assert 'Schema version: 1' in prompt
    assert 'Requested ready-issue cap after sequencing:' in prompt
    assert '5' in prompt
    assert 'strict JSON' in prompt
    assert 'full candidate pool after optional caller-driven project scope' in prompt.lower()
    assert 'discover only' in prompt.lower()
    assert 'sequence only' in prompt.lower()
    assert 'discover+sequence' in prompt.lower()
    assert 'initial discovery pass before finalizing waves' in prompt.lower()
    assert 'fetch live linear issue details' in prompt.lower()
    assert 'child issues' in prompt.lower()
    assert 'related issues' in prompt.lower()
    assert 'delegate to `librarian`' in prompt
    assert 'delegate to `context-gather`' in prompt


def test_render_sequence_prompt_allows_discovery_pass_before_final_sequencing():
    from autonomy_sequence import render_sequence_prompt

    template = """Autonomy sequencing
Schema version: {{SCHEMA_VERSION}}

Candidate evaluation:
{{CANDIDATE_EVALUATION_JSON}}

Requested ready-issue cap after sequencing:
{{RESULT_LIMIT}}

Policy:
- discover only: expand context and the candidate pool, but do not finalize wave ordering.
- sequence only: keep the provided pool fixed and only order what is already present.
- discover+sequence: the default; discover first when the pool is too narrow, then finalize waves.
- If the pool is sparse, ambiguous, or low-confidence, perform an initial discovery pass before finalizing waves.

Return strict JSON only.
"""

    prompt = render_sequence_prompt(
        template,
        {
            "items": [
                {"issue_identifier": "REP-1", "eligible": True, "reasons": [], "notes": []},
            ],
            "summary": {"eligible_count": 1},
        },
        result_limit=5,
        schema_version=1,
    )

    assert 'discover only' in prompt.lower()
    assert 'sequence only' in prompt.lower()
    assert 'discover+sequence' in prompt.lower()
    assert 'initial discovery pass before finalizing waves' in prompt.lower()


def test_apply_sequence_result_limit_caps_ready_issues_after_sequencing():
    from autonomy_sequence import apply_sequence_result_limit

    canonical = {
        "schema_version": 1,
        "waves": [
            {
                "name": "wave-1",
                "issues": [
                    {"issue_identifier": "REP-1", "rationale": "start here"},
                    {"issue_identifier": "REP-2", "rationale": "next"},
                ],
                "rationale": "first pair",
            },
            {
                "name": "wave-2",
                "issues": [
                    {"issue_identifier": "REP-3", "rationale": "third"},
                    {"issue_identifier": "REP-4", "rationale": "overflow"},
                ],
                "rationale": "second pair",
            },
        ],
        "deferred": [
            {"issue_identifier": "REP-5", "reason": "blocked-by:REP-1", "rationale": "stay deferred"},
        ],
        "risk_notes": [],
    }

    limited = apply_sequence_result_limit(canonical, 3)

    assert [issue["issue_identifier"] for issue in limited["waves"][0]["issues"]] == ["REP-1", "REP-2"]
    assert [issue["issue_identifier"] for issue in limited["waves"][1]["issues"]] == ["REP-3"]
    assert [item["issue_identifier"] for item in limited["deferred"]] == ["REP-5", "REP-4"]
    assert limited["deferred"][1]["reason"] == "post-sequencing-cap:3"


def test_normalize_sequence_response_accepts_fenced_json():
    from autonomy_sequence import normalize_sequence_response

    evaluation = {
        "items": [
            {"issue_identifier": "REP-1", "eligible": True},
            {"issue_identifier": "REP-2", "eligible": False},
        ],
        "summary": {"eligible_count": 1},
    }

    raw_response = """```json
    {
      "schema_version": 1,
      "waves": [
        {
          "name": "wave-1",
          "issues": [
            {"issue_identifier": "REP-1", "rationale": "start here"}
          ],
          "rationale": "eligible first"
        }
      ],
      "deferred": [
        {"issue_identifier": "REP-2", "reason": "blocked-by:REP-1", "rationale": "retain context"}
      ],
      "risk_notes": ["dependency first"]
    }
    ```"""

    canonical = normalize_sequence_response(raw_response, evaluation, schema_version=1)

    assert canonical["schema_version"] == 1
    assert canonical["waves"][0]["issues"][0]["issue_identifier"] == "REP-1"
    assert canonical["deferred"][0]["issue_identifier"] == "REP-2"
    assert canonical["risk_notes"] == ["dependency first"]


def test_normalize_sequence_response_rejects_ineligible_issue_in_wave():
    from autonomy_sequence import SequenceValidationError, normalize_sequence_response

    evaluation = {
        "items": [
            {"issue_identifier": "REP-1", "eligible": True},
            {"issue_identifier": "REP-2", "eligible": False},
        ],
        "summary": {"eligible_count": 1},
    }

    raw_response = json.dumps(
        {
            "schema_version": 1,
            "waves": [
                {
                    "name": "wave-1",
                    "issues": [
                        {"issue_identifier": "REP-2", "rationale": "should stay deferred"},
                    ],
                }
            ],
            "deferred": [
                {"issue_identifier": "REP-1", "reason": "eligible work is deferred"},
            ],
            "risk_notes": [],
        }
    )

    with pytest.raises(SequenceValidationError, match="must remain deferred"):
        normalize_sequence_response(raw_response, evaluation, schema_version=1)


def test_normalize_sequence_response_rejects_missing_waves():
    from autonomy_sequence import SequenceValidationError, normalize_sequence_response

    with pytest.raises(SequenceValidationError, match="waves"):
        normalize_sequence_response(
            json.dumps({"schema_version": 1, "deferred": [], "risk_notes": []}),
            {"items": [{"issue_identifier": "REP-1", "eligible": True}]},
            schema_version=1,
        )


@pytest.mark.parametrize("missing_key", ["deferred", "risk_notes"])
def test_normalize_sequence_response_rejects_missing_contract_keys(missing_key: str):
    from autonomy_sequence import SequenceValidationError, normalize_sequence_response

    payload = {"schema_version": 1, "waves": [], "deferred": [], "risk_notes": []}
    payload.pop(missing_key)
    with pytest.raises(SequenceValidationError, match=missing_key):
        normalize_sequence_response(json.dumps(payload), {"items": []}, schema_version=1)


def test_normalize_sequence_response_rejects_malformed_issue_entries():
    from autonomy_sequence import SequenceValidationError, normalize_sequence_response

    with pytest.raises(SequenceValidationError, match="REP-9"):
        normalize_sequence_response(
            json.dumps(
                {
                    "schema_version": 1,
                    "waves": [
                        {
                            "issues": [
                                {"issue_identifier": "REP-9", "rationale": "missing from evaluation"},
                            ]
                        }
                    ],
                    "deferred": [],
                    "risk_notes": [],
                }
            ),
            {"items": [{"issue_identifier": "REP-1", "eligible": True}]},
            schema_version=1,
        )


def test_write_sequence_artifacts_persists_latest_pointer(tmp_path: Path):
    from autonomy_sequence import write_sequence_artifacts

    output_dir = tmp_path / "sequences"
    canonical = {
        "schema_version": 1,
        "waves": [
            {
                "name": "wave-1",
                "issues": [{"issue_identifier": "REP-1", "rationale": "start here"}],
                "rationale": "eligible first",
            }
        ],
        "deferred": [],
        "risk_notes": [],
    }

    result = write_sequence_artifacts(
        output_dir,
        prompt_text="prompt text",
        raw_response_text="{\"schema_version\":1}",
        canonical=canonical,
    )

    latest_path = output_dir / "latest.json"
    assert latest_path.exists()
    latest = json.loads(latest_path.read_text())
    assert latest["artifacts"]["canonical_path"] == result["artifacts"]["canonical_path"]
    assert json.loads(Path(result["artifacts"]["canonical_path"]).read_text()) == latest
    assert Path(result["artifacts"]["prompt_path"]).read_text() == "prompt text"


def test_main_preserves_prompt_raw_and_error_artifacts_on_validation_failure(tmp_path: Path, capsys):
    from autonomy_sequence import main

    template_path = tmp_path / "autonomy-sequence.md"
    template_path.write_text(
        """Sequencing policy
Schema version: {{SCHEMA_VERSION}}

Candidate evaluation:
{{CANDIDATE_EVALUATION_JSON}}
""",
        encoding="utf-8",
    )

    evaluation_json = json.dumps(
        {
            "items": [
                {"issue_identifier": "REP-1", "eligible": True},
                {"issue_identifier": "REP-2", "eligible": False},
            ],
            "summary": {"eligible_count": 1},
        }
    )
    raw_response = json.dumps(
        {
            "schema_version": 1,
            "waves": [
                {"name": "wave-1", "issues": [{"issue_identifier": "REP-2"}]}
            ],
            "deferred": [{"issue_identifier": "REP-1"}],
            "risk_notes": [],
        }
    )
    output_dir = tmp_path / "sequences"

    exit_code = main(
        [
            "finalize",
            "--template-file",
            str(template_path),
            "--evaluation-json",
            evaluation_json,
            "--raw-response",
            raw_response,
            "--output-dir",
            str(output_dir),
        ]
    )

    captured = capsys.readouterr()

    assert exit_code == 1
    assert "Sequencing validation failed:" in captured.err
    assert "Traceback" not in captured.err

    latest_path = output_dir / "latest.json"
    latest = json.loads(latest_path.read_text())
    assert latest["status"] == "error"
    assert "must remain deferred" in latest["error"]["message"]

    prompt_path = Path(latest["artifacts"]["prompt_path"])
    raw_path = Path(latest["artifacts"]["raw_response_path"])
    error_path = Path(latest["artifacts"]["error_path"])

    assert prompt_path.exists()
    assert raw_path.exists()
    assert error_path.exists()
    assert "canonical_path" not in latest["artifacts"]
    assert "REP-2" in prompt_path.read_text()
    assert raw_path.read_text().strip() == raw_response
