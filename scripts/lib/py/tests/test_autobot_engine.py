"""Tests for autobot_engine.py."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import autobot_engine as engine


def _mock_ts(monkeypatch, expected_command: str, payload: dict[str, object], response: dict[str, object]):
    def fake_run(args, input=None, text=None, capture_output=None, check=None):
        assert args[:5] == ["pnpm", "--dir", str(engine.AUTOBOT_ENGINE_TS_PACKAGE), "exec", "tsx"]
        assert args[5:] == ["src/cli.ts", expected_command]
        actual_payload = json.loads(input or "{}")
        for key, value in payload.items():
            assert actual_payload.get(key) == value
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=json.dumps(response), stderr="")

    monkeypatch.setattr(engine.subprocess, "run", fake_run)


def test_select_work_prefers_claimed_and_skips_terminal_states(monkeypatch):
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "released"},
            {"issue_identifier": "REP-2", "claim_state": "claimed"},
            {"issue_identifier": "REP-3", "claim_state": "canceled"},
        ]
    }
    response = {"selected": payload["items"][1], "summary": {"selected_state": "claimed", "terminal": 2}}
    _mock_ts(monkeypatch, "select-work", {**payload, "allow_recovery": True}, response)

    result = engine.select_work(payload)

    assert result["selected"]["issue_identifier"] == "REP-2"
    assert result["summary"]["selected_state"] == "claimed"
    assert result["summary"]["terminal"] == 2


def test_select_work_prefers_queued_before_claimed(monkeypatch):
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "claimed"},
            {"issue_identifier": "REP-2", "claim_state": "queued"},
            {"issue_identifier": "REP-3", "claim_state": "running"},
        ]
    }
    response = {"selected": payload["items"][1], "summary": {"selected_state": "queued", "by_state": {"queued": 1}}}
    _mock_ts(monkeypatch, "select-work", {**payload, "allow_recovery": True}, response)

    result = engine.select_work(payload)

    assert result["selected"]["issue_identifier"] == "REP-2"
    assert result["summary"]["selected_state"] == "queued"
    assert result["summary"]["by_state"]["queued"] == 1


def test_select_work_skips_recovery_when_disabled(monkeypatch):
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "failed"},
            {"issue_identifier": "REP-2", "claim_state": "running"},
        ]
    }
    response = {"selected": payload["items"][1], "summary": {"selected_state": "running"}}
    _mock_ts(monkeypatch, "select-work", {**payload, "allow_recovery": False}, response)

    result = engine.select_work(payload, allow_recovery=False)

    assert result["selected"]["issue_identifier"] == "REP-2"
    assert result["summary"]["selected_state"] == "running"


def test_select_work_polls_reconciling_items_before_recovery(monkeypatch):
    payload = {
        "items": [
            {"issue_identifier": "REP-1", "claim_state": "reconciling"},
            {"issue_identifier": "REP-2", "claim_state": "failed"},
        ]
    }
    response = {"selected": payload["items"][0], "summary": {"selected_state": "reconciling"}}
    _mock_ts(monkeypatch, "select-work", {**payload, "allow_recovery": True}, response)

    result = engine.select_work(payload)

    assert result["selected"]["issue_identifier"] == "REP-1"
    assert result["summary"]["selected_state"] == "reconciling"


def test_render_status_uses_expected_shape(monkeypatch):
    payload = {
        "schema_version": 1,
        "config": {"schema_version": 1, "config_path": "/repo/.autobot/config.json", "values": {}},
        "items": [{"issue_identifier": "REP-1", "claim_state": "claimed"}],
    }
    _mock_ts(
        monkeypatch,
        "select-work",
        {**payload, "allow_recovery": True},
        {"selected": payload["items"][0], "summary": {"selected_issue_identifier": "REP-1", "selected_state": "claimed"}},
    )

    status = engine.render_status(
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

    assert set(status) == {"schema_version", "config", "engine", "paths", "queue", "generated_at"}
    assert status["schema_version"] == 1
    assert status["config"]["schema_version"] == 1
    assert status["engine"]["pid"] == 1234
    assert status["engine"]["running"] is True
    assert status["engine"]["mode"] == "daemon"
    assert status["queue"]["selected_work"]["issue_identifier"] == "REP-1"
    assert status["queue"]["items"][0]["conditions"] == []
    assert status["paths"]["log"] == "/repo/.autobot/engine.log"


def test_decide_recovery_releases_on_merged_pr_or_done_linear(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "linear": {"item": {"status": {"type": "done"}}},
        "pr": {"state": "OPEN"},
    }
    response = {"action": "release", "reason": "linear-done", "fetch_main": True, "cleanup_eligible": True}
    _mock_ts(monkeypatch, "decide-recovery", payload, response)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "release"
    assert decision["fetch_main"] is True


def test_decide_recovery_reconciles_on_ci_review_or_conflicts(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "merge_conflict_count": 1,
        "pr": {"reviewDecision": "CHANGES_REQUESTED"},
    }
    response = {"action": "reconcile", "reason": "pr-ci-review-conflict", "fetch_main": False, "cleanup_eligible": False}
    _mock_ts(monkeypatch, "decide-recovery", payload, response)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "reconcile"


def test_decide_recovery_normalizes_snake_case_payload(monkeypatch):
    payload = {
        "claim_state": "running",
        "attempt_count": 2,
        "max_attempts": 3,
        "workspace_exists": True,
        "merge_conflict_count": 0,
        "linear": {"item": {"status": {"type": "done"}}},
        "pr": {"state": "OPEN"},
    }
    response = {"action": "release", "reason": "linear-done", "fetch_main": True, "cleanup_eligible": True}
    _mock_ts(
        monkeypatch,
        "decide-recovery",
        {"claimState": "running", "attemptCount": 2, "maxAttempts": 3, "workspaceExists": True},
        response,
    )

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "release"


def test_decide_recovery_preserves_missing_nested_fields_for_ts_fallback(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "linear": {"item": {"status": {"type": "done"}}},
        "pr": {"review_activity": {"top_level_comments": []}},
    }

    def fake_run(args, input=None, text=None, capture_output=None, check=None):
        actual_payload = json.loads(input or "{}")
        assert "linearStateType" not in actual_payload
        assert "linearStateName" not in actual_payload
        assert "statusState" not in actual_payload
        assert actual_payload["linear"]["item"]["status"]["type"] == "done"
        return subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout=json.dumps({"action": "release", "reason": "linear-done", "fetch_main": True, "cleanup_eligible": True}),
            stderr="",
        )

    monkeypatch.setattr(engine.subprocess, "run", fake_run)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "release"


def test_summarize_review_activity_separates_comment_types():
    activity = engine.summarize_review_activity(
        {
            "reviewDecision": "COMMENTED",
            "reviews": [{"author": {"login": "reviewer"}, "state": "APPROVED", "submittedAt": "2026-05-08T12:00:00Z"}],
            "issue_comments": [{"id": 1, "body": "top level", "author": {"login": "alice"}}],
            "review_comments": [{"id": 2, "body": "code line", "author": {"login": "bob"}, "path": "src/app.py", "line": 12}],
        }
    )

    assert activity["review_decision"] == "COMMENTED"
    assert activity["reviews"][0]["state"] == "APPROVED"
    assert activity["top_level_comments"][0]["body"] == "top level"
    assert activity["code_line_comments"][0]["path"] == "src/app.py"


def test_decide_recovery_ignores_comments_without_changes_requested_review(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "pr": {
            "reviewDecision": "COMMENTED",
            "review_activity": {
                "top_level_comments": [{"body": "nit"}],
                "code_line_comments": [{"body": "fix this"}],
            },
        },
    }
    response = {"action": "continue", "reason": "no-recovery-needed", "fetch_main": False, "cleanup_eligible": False}
    _mock_ts(monkeypatch, "decide-recovery", payload, response)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "continue"


def test_decide_recovery_reconciles_on_failed_status_check_rollup_list(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "pr": {"statusCheckRollup": [{"name": "ci", "state": "FAILURE"}]},
    }
    response = {"action": "reconcile", "reason": "pr-ci-review-conflict", "fetch_main": False, "cleanup_eligible": False}
    _mock_ts(monkeypatch, "decide-recovery", payload, response)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "reconcile"


def test_decide_recovery_cancels_terminal_linear_states(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "linear": {"item": {"status": {"type": "canceled"}}},
    }
    response = {"action": "cancel", "reason": "linear-canceled", "fetch_main": False, "cleanup_eligible": False}
    _mock_ts(monkeypatch, "decide-recovery", payload, response)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "cancel"


def test_decide_recovery_keeps_in_progress_linear_work_unreleased(monkeypatch):
    payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": True,
        "linear": {"item": {"status": {"type": "in_progress"}}},
        "pr": {"state": "OPEN"},
    }
    response = {"action": "continue", "reason": "no-recovery-needed", "fetch_main": False, "cleanup_eligible": False}
    _mock_ts(monkeypatch, "decide-recovery", payload, response)

    decision = engine.decide_recovery(payload)

    assert decision["action"] == "continue"


def test_decide_recovery_retries_missing_workspace_until_attempts_are_exhausted(monkeypatch):
    retry_payload = {
        "attempt_count": 1,
        "max_attempts": 3,
        "workspace_exists": False,
        "claim_state": "failed",
    }
    stop_payload = {
        "attempt_count": 3,
        "max_attempts": 3,
        "workspace_exists": False,
        "claim_state": "failed",
    }

    def fake_run(args, input=None, text=None, capture_output=None, check=None):
        payload = json.loads(input or "{}")
        if (
            payload.get("claim_state") == "failed"
            and payload.get("attempt_count") == 1
            and payload.get("workspace_exists") is False
        ):
            response = {"action": "retry", "reason": "missing-workspace", "fetch_main": False, "cleanup_eligible": False}
        elif (
            payload.get("claim_state") == "failed"
            and payload.get("attempt_count") == 3
            and payload.get("workspace_exists") is False
        ):
            response = {"action": "stop", "reason": "missing-workspace-exhausted", "fetch_main": False, "cleanup_eligible": False}
        else:
            raise AssertionError(payload)
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=json.dumps(response), stderr="")

    monkeypatch.setattr(engine.subprocess, "run", fake_run)

    retry_decision = engine.decide_recovery(retry_payload)
    stop_decision = engine.decide_recovery(stop_payload)

    assert retry_decision["action"] == "retry"
    assert stop_decision["action"] == "stop"


def test_discover_issue_ids_deduplicates_items():
    ids = engine.discover_issue_ids(
        {
            "items": [
                {"issue_identifier": "REP-1"},
                {"identifier": "REP-1"},
                {"issue_identifier": "REP-2"},
            ]
        }
    )

    assert ids == ["REP-1", "REP-2"]
