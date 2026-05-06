"""Tests for autonomy_state.py."""

import os
import sqlite3
import sys
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from autonomy_state import ActiveClaimError, AutonomyStore, main


def _store(tmp_path: Path, workspace_root: Path | None = None) -> AutonomyStore:
    checkout = tmp_path / "checkout"
    checkout.mkdir(exist_ok=True)
    return AutonomyStore(
        db_path=tmp_path / "state.sqlite",
        main_checkout=checkout,
        workspace_root=workspace_root,
    )


def _workspace(tmp_path: Path, name: str = "repro-wt-rep-1094") -> Path:
    path = tmp_path / name
    path.mkdir()
    return path


def _legacy_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "legacy.sqlite"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE claims (
                issue_id TEXT NOT NULL,
                issue_identifier TEXT PRIMARY KEY,
                claim_state TEXT NOT NULL,
                workspace_path TEXT NOT NULL,
                phase TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                retry_state TEXT,
                retry_after TEXT,
                retry_reason TEXT,
                last_observed_issue_state_name TEXT,
                last_observed_issue_state_type TEXT,
                claimed_by TEXT,
                claimed_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                released_at TEXT
            );

            CREATE TABLE runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_identifier TEXT NOT NULL,
                attempt INTEGER NOT NULL,
                phase TEXT NOT NULL,
                state TEXT NOT NULL,
                workspace_path TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                last_error TEXT
            );
            """
        )
    return db_path


def test_claim_survives_store_reload(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    claim = store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    assert claim["issue_identifier"] == "REP-1094"

    reloaded = _store(tmp_path)
    status = reloaded.status()

    assert status["items"]
    assert status["items"][0]["issue_identifier"] == "REP-1094"
    assert status["items"][0]["workspace_path"] == str(workspace)
    assert status["items"][0]["claim_state"] == "claimed"


def test_duplicate_active_claim_is_rejected(tmp_path: Path):
    store = _store(tmp_path)
    first_workspace = _workspace(tmp_path, "repro-wt-first")
    second_workspace = _workspace(tmp_path, "repro-wt-second")

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(first_workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    with pytest.raises(ActiveClaimError) as excinfo:
        store.claim(
            issue_identifier="REP-1094",
            issue_id="issue-uuid-2",
            workspace_path=str(second_workspace),
            phase="observe",
            issue_state_name="In Progress",
            issue_state_type="started",
        )

    assert excinfo.value.existing_claim["workspace_path"] == str(first_workspace)


def test_workspace_root_can_be_configured(tmp_path: Path):
    workspace_root = tmp_path / "workspaces"
    workspace_root.mkdir()
    store = _store(tmp_path, workspace_root=workspace_root)
    workspace = workspace_root / "repro-wt-rep-1094"
    workspace.mkdir()

    claim = store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    assert claim["workspace_path"] == str(workspace)


def test_workspace_path_outside_workspace_root_is_rejected(tmp_path: Path):
    workspace_root = tmp_path / "workspaces"
    workspace_root.mkdir()
    store = _store(tmp_path, workspace_root=workspace_root)
    outside_workspace = _workspace(tmp_path)

    with pytest.raises(ValueError, match="workspace root"):
        store.claim(
            issue_identifier="REP-1094",
            issue_id="issue-uuid-1",
            workspace_path=str(outside_workspace),
            phase="observe",
            issue_state_name="In Progress",
            issue_state_type="started",
        )


def test_relative_workspace_path_is_rejected(tmp_path: Path):
    store = _store(tmp_path)

    with pytest.raises(ValueError, match="absolute"):
        store.claim(
            issue_identifier="REP-1094",
            issue_id="issue-uuid-1",
            workspace_path="repro-wt-rep-1094",
            phase="observe",
            issue_state_name="In Progress",
            issue_state_type="started",
        )


def test_release_permits_later_claim(tmp_path: Path):
    store = _store(tmp_path)
    first_workspace = _workspace(tmp_path, "repro-wt-first")
    second_workspace = _workspace(tmp_path, "repro-wt-second")

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(first_workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )
    store.release("REP-1094", reason="done")

    claim = store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-2",
        workspace_path=str(second_workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    assert claim["workspace_path"] == str(second_workspace)
    assert store.status()["items"][0]["claim_state"] == "claimed"


def test_legacy_claim_schema_is_migrated_in_place(tmp_path: Path):
    db_path = _legacy_db(tmp_path)
    now = "2026-05-06T19:00:00Z"
    workspace = _workspace(tmp_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO claims (
                issue_id, issue_identifier, claim_state, workspace_path, phase,
                attempt_count, retry_state, retry_after, retry_reason,
                last_observed_issue_state_name, last_observed_issue_state_type,
                claimed_by, claimed_at, updated_at, released_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "issue-uuid-1",
                "REP-1094",
                "claimed",
                str(workspace),
                "observe",
                0,
                None,
                None,
                None,
                "In Progress",
                "started",
                "autopilot",
                now,
                now,
                None,
            ),
        )

    store = AutonomyStore(db_path=db_path, main_checkout=tmp_path / "checkout")
    status = store.status()

    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(claims)")}

    assert {"canceled_at", "last_error", "last_error_at", "linear_synced_at", "linear_sync_error"} <= columns
    assert status["items"][0]["issue_identifier"] == "REP-1094"
    assert status["summary"]["claim_states"]["claimed"] == 1
    assert status["generated_at"]


def test_status_summary_and_recent_errors_include_failures(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )
    store.run_start("REP-1094", phase="observe", workspace_path=str(workspace))
    store.run_finish("REP-1094", attempt=1, state="failed", last_error="boom")
    store.record_sync("REP-1094", ok=False, error="linear sync failed")

    status = store.status()

    assert status["summary"]["failed_runs"] == 1
    assert status["summary"]["sync_errors"] == 1
    assert any(error["kind"] == "run" for error in status["recent_errors"])
    assert any(error["kind"] == "sync" for error in status["recent_errors"])
    assert status["items"][0]["claim_state"] == "failed"
    assert status["items"][0]["last_error"] == "boom"
    assert status["items"][0]["linear_sync_error"] == "linear sync failed"


def test_cancel_and_retry_update_claim_state(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    canceled = store.cancel("REP-1094", reason="manual stop")
    assert canceled["claim_state"] == "canceled"
    assert canceled["retry_reason"] == "manual stop"
    assert store.status()["items"] == []

    retried = store.retry("REP-1094", reason="try again")
    assert retried["claim_state"] == "released"
    assert retried["retry_reason"] == "try again"
    assert store.status()["items"] == []
    assert store.status(all_claims=True)["items"][0]["claim_state"] == "released"


def test_canceled_claim_stays_terminal_through_reconcile(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    store.cancel("REP-1094", reason="manual stop")
    updated = store.reconcile(
        "REP-1094",
        issue_state_name="Done",
        issue_state_type="closed",
    )

    assert updated == []
    assert store.status()["items"] == []
    assert store.status(all_claims=True)["items"][0]["claim_state"] == "canceled"


def test_run_start_finish_persists_attempt_state(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    run = store.run_start("REP-1094", phase="observe", workspace_path=str(workspace))
    assert run["attempt"] == 1

    store.run_finish("REP-1094", attempt=1, state="finished", last_error=None)

    status = store.status()
    assert status["runs"]
    assert status["runs"][0]["attempt"] == 1
    assert status["runs"][0]["state"] == "finished"
    assert status["items"][0]["attempt_count"] == 1


def test_reconcile_marks_missing_workspace_stale(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    os.rmdir(workspace)

    store.reconcile("REP-1094")
    status = store.status()

    assert status["items"][0]["claim_state"] == "stale"
    assert status["items"][0]["retry_reason"] == "missing-workspace"


def test_reconcile_updates_observed_state_when_still_active(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    store.reconcile(
        "REP-1094",
        issue_state_name="Ready for Review",
        issue_state_type="started",
    )

    status = store.status()

    assert status["items"][0]["claim_state"] == "claimed"
    assert status["items"][0]["last_observed_issue_state_name"] == "Ready for Review"
    assert status["items"][0]["last_observed_issue_state_type"] == "started"


def test_reconcile_marks_terminal_issue_state_stale(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )

    store.reconcile(
        "REP-1094",
        issue_state_name="Done",
        issue_state_type="closed",
    )

    status = store.status()

    assert status["items"][0]["claim_state"] == "stale"
    assert status["items"][0]["retry_state"] == "stale"
    assert status["items"][0]["retry_reason"] == "terminal-issue-state:closed"


def test_status_human_output_includes_runs(tmp_path: Path):
    store = _store(tmp_path)
    workspace = _workspace(tmp_path)

    store.claim(
        issue_identifier="REP-1094",
        issue_id="issue-uuid-1",
        workspace_path=str(workspace),
        phase="observe",
        issue_state_name="In Progress",
        issue_state_type="started",
    )
    store.run_start("REP-1094", phase="observe", workspace_path=str(workspace))

    stdout = StringIO()
    with redirect_stdout(stdout):
        exit_code = main(
            [
                "--db",
                str(tmp_path / "state.sqlite"),
                "--main-checkout",
                str(tmp_path / "checkout"),
                "status",
            ]
        )

    output = stdout.getvalue()
    assert exit_code == 0
    assert "CLAIMS" in output
    assert "RUNS" in output
    assert "REP-1094" in output
    assert "running" in output
