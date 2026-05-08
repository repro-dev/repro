"""Tests for autobot_engine.py."""

from __future__ import annotations

import json
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from autobot_engine import discover_issue_ids, render_status, select_work


def test_select_work_prefers_claimed_and_skips_terminal_states():
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "released"},
            {"issue_identifier": "REP-2", "claim_state": "claimed"},
            {"issue_identifier": "REP-3", "claim_state": "canceled"},
        ]
    }

    result = select_work(payload)

    assert result["selected"]["issue_identifier"] == "REP-2"
    assert result["summary"]["selected_state"] == "claimed"
    assert result["summary"]["terminal"] == 2


def test_select_work_skips_recovery_when_disabled():
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "failed"},
            {"issue_identifier": "REP-2", "claim_state": "running"},
        ]
    }

    result = select_work(payload, allow_recovery=False)

    assert result["selected"] is None
    assert result["summary"]["selected_state"] == ""


def test_render_status_uses_expected_shape():
    payload = {"items": [{"issue_identifier": "REP-1", "claim_state": "claimed"}]}

    status = render_status(
        pid=1234,
        running=True,
        lock_path="/repo/.autobot/engine.lock",
        pid_path="/repo/.autobot/engine.pid",
        log_path="/repo/.autobot/engine.log",
        status_path="/repo/.autobot/status.json",
        queue_payload=payload,
        current_issue="REP-1",
        current_phase="delivery",
        current_attempt=1,
        last_tick_at="2026-05-08T12:34:56Z",
    )

    assert set(status) == {"engine", "paths", "queue", "generated_at"}
    assert status["engine"]["pid"] == 1234
    assert status["engine"]["running"] is True
    assert status["queue"]["selected_work"]["issue_identifier"] == "REP-1"
    assert status["paths"]["log"] == "/repo/.autobot/engine.log"


def test_discover_issue_ids_deduplicates_items():
    ids = discover_issue_ids(
        {
            "items": [
                {"issue_identifier": "REP-1"},
                {"identifier": "REP-1"},
                {"issue_identifier": "REP-2"},
            ]
        }
    )

    assert ids == ["REP-1", "REP-2"]
