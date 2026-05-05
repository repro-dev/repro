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
        schema_version=1,
    )

    assert '"issue_identifier": "REP-1"' in prompt
    assert 'Schema version: 1' in prompt
    assert 'strict JSON' in prompt


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


def test_normalize_sequence_response_rejects_missing_waves():
    from autonomy_sequence import SequenceValidationError, normalize_sequence_response

    with pytest.raises(SequenceValidationError, match="waves"):
        normalize_sequence_response(
            json.dumps({"schema_version": 1, "deferred": [], "risk_notes": []}),
            {"items": [{"issue_identifier": "REP-1", "eligible": True}]},
            schema_version=1,
        )


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
