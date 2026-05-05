"""Tests for autonomy_state.py."""

import os
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
