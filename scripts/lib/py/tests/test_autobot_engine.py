"""Tests for autobot_engine.py."""

from __future__ import annotations

import json
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from autobot_engine import decide_recovery, discover_issue_ids, render_status, select_work


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

    assert result["selected"]["issue_identifier"] == "REP-2"
    assert result["summary"]["selected_state"] == "running"


def test_select_work_polls_reconciling_items_before_recovery():
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "reconciling"},
            {"issue_identifier": "REP-2", "claim_state": "failed"},
        ]
    }

    result = select_work(payload)

    assert result["selected"]["issue_identifier"] == "REP-1"
    assert result["summary"]["selected_state"] == "reconciling"


def test_render_status_uses_expected_shape():
    payload = {"items": [{"issue_identifier": "REP-1", "claim_state": "claimed"}]}

    status = render_status(
        pid=1234,
        running=True,
        engine_mode="daemon",
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
    assert status["engine"]["mode"] == "daemon"
    assert status["queue"]["selected_work"]["issue_identifier"] == "REP-1"
    assert status["paths"]["log"] == "/repo/.autobot/engine.log"


def test_decide_recovery_releases_on_merged_pr_or_done_linear():
    decision = decide_recovery(
        {
            "attempt_count": 1,
            "max_attempts": 3,
            "workspace_exists": True,
            "linear": {"item": {"status": {"type": "done"}}},
            "pr": {"state": "OPEN"},
        }
    )

    assert decision["action"] == "release"
    assert decision["fetch_main"] is True


def test_decide_recovery_reconciles_on_ci_review_or_conflicts():
    decision = decide_recovery(
        {
            "attempt_count": 1,
            "max_attempts": 3,
            "workspace_exists": True,
            "merge_conflict_count": 1,
            "pr": {"reviewDecision": "CHANGES_REQUESTED"},
        }
    )

    assert decision["action"] == "reconcile"


def test_decide_recovery_cancels_terminal_linear_states():
    decision = decide_recovery(
        {
            "attempt_count": 1,
            "max_attempts": 3,
            "workspace_exists": True,
            "linear": {"item": {"status": {"type": "canceled"}}},
        }
    )

    assert decision["action"] == "cancel"


def test_decide_recovery_keeps_in_progress_linear_work_unreleased():
    decision = decide_recovery(
        {
            "attempt_count": 1,
            "max_attempts": 3,
            "workspace_exists": True,
            "linear": {"item": {"status": {"type": "in_progress"}}},
            "pr": {"state": "OPEN"},
        }
    )

    assert decision["action"] == "continue"


def test_decide_recovery_retries_missing_workspace_until_attempts_are_exhausted():
    retry_decision = decide_recovery(
        {
            "attempt_count": 1,
            "max_attempts": 3,
            "workspace_exists": False,
            "claim_state": "failed",
        }
    )
    stop_decision = decide_recovery(
        {
            "attempt_count": 3,
            "max_attempts": 3,
            "workspace_exists": False,
            "claim_state": "failed",
        }
    )

    assert retry_decision["action"] == "retry"
    assert stop_decision["action"] == "stop"


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
