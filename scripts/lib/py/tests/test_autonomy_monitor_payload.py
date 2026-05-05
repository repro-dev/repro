"""Tests for autonomy_monitor_payload.py."""

from __future__ import annotations

import json

from conftest import run_script_json


def test_batches_candidates_and_preserves_order():
    payload = run_script_json(
        "autonomy_monitor_payload.py",
        args=[
            json.dumps(
                [
                    {"identifier": "REP-2", "priority": 2, "project": {"name": "Engineering"}, "status": {"name": "Todo", "type": "backlog"}},
                    {"identifier": "REP-3", "priority": 3, "project": {"name": "Engineering"}, "status": {"name": "Todo", "type": "backlog"}},
                ]
            ),
            json.dumps(
                [
                    {"identifier": "REP-1", "priority": 1, "project": {"name": "Engineering"}, "status": {"name": "Todo", "type": "todo"}},
                    {"identifier": "REP-3", "priority": 3, "project": {"name": "Engineering"}, "status": {"name": "Todo", "type": "todo"}},
                ]
            ),
            json.dumps({"items": [{"issue_identifier": "REP-1", "claim_state": "claimed"}]}),
        ],
    )

    assert [issue["identifier"] for issue in payload["issues"]] == ["REP-2", "REP-3", "REP-1"]
    assert payload["claims"][0]["issue_identifier"] == "REP-1"
