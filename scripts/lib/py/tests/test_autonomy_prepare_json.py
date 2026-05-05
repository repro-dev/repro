"""Tests for autonomy_prepare_json.py."""

from __future__ import annotations

import json

from conftest import run_script_json


def test_wraps_existing_claim():
    result = run_script_json(
        "autonomy_prepare_json.py",
        args=["existing-claim", json.dumps({"issue_identifier": "REP-1"})],
    )

    assert result == {"error": "existing claim", "claim": {"issue_identifier": "REP-1"}}


def test_wraps_prepare_output():
    result = run_script_json(
        "autonomy_prepare_json.py",
        args=[
            "prepare",
            "observe",
            "autopilot",
            "uuid-1",
            "REP-1",
            "/tmp/worktree",
            "gary-wt-rep-1",
            "rep-1",
            "Todo",
            "backlog",
            json.dumps({"claim": {"issue_identifier": "REP-1"}}),
        ],
    )

    assert result == {
        "prepare": {
            "issue_id": "uuid-1",
            "issue_identifier": "REP-1",
            "workspace_path": "/tmp/worktree",
            "branch": "gary-wt-rep-1",
            "slug": "rep-1",
            "phase": "observe",
            "claimed_by": "autopilot",
            "issue_state_name": "Todo",
            "issue_state_type": "backlog",
            "claim": {"issue_identifier": "REP-1"},
        }
    }
