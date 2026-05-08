"""Tests for autobot_queue.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from autobot_queue import (
    discover_issue_ids,
    parse_log_bundle,
    public_item,
    public_summary,
    public_state,
    shape_status,
)


def test_public_state_maps_internal_states():
    assert public_state("queued") == "queued"
    assert public_state("claimed") == "queued"
    assert public_state("running") == "running"
    assert public_state("reconciling") == "needs_attention"
    assert public_state("failed") == "needs_attention"
    assert public_state("released") == "released"
    assert public_state("canceled") == "removed"


def test_shape_status_filters_terminal_items_for_list_but_keeps_them_for_single_item():
    payload = {
        "items": [
            {
                "issue_identifier": "REP-1",
                "claim_state": "queued",
                "phase": "queue",
                "workspace_path": "/tmp/workspaces/repro-wt-rep-1",
            },
            {
                "issue_identifier": "REP-2",
                "claim_state": "released",
                "phase": "queue",
                "workspace_path": "/tmp/workspaces/repro-wt-rep-2",
            },
        ],
        "runs": [],
        "summary": {"claim_states": {"queued": 1, "released": 1}},
        "generated_at": "2026-05-08T12:00:00Z",
    }

    listed = shape_status(payload)
    detailed = shape_status(payload, issue_identifier="REP-2")

    assert [item["issue_identifier"] for item in listed["items"]] == ["REP-1"]
    assert detailed["items"][0]["state"] == "released"
    assert listed["summary"]["queued"] == 1
    assert listed["summary"]["released"] == 1


def test_public_item_keeps_public_fields_only():
    item = public_item(
        {
            "issue_identifier": "REP-1",
            "claim_state": "claimed",
            "phase": "queue",
            "workspace_path": "/tmp/workspaces/repro-wt-rep-1",
            "attempt_count": 0,
        }
    )

    assert item["issue_identifier"] == "REP-1"
    assert item["state"] == "queued"
    assert "claim_state" not in item


def test_public_summary_counts_public_states():
    summary = public_summary(
        [
            {"state": "queued"},
            {"state": "running"},
            {"state": "needs_attention"},
            {"state": "released"},
            {"state": "removed"},
        ]
    )

    assert summary == {
        "total": 5,
        "queued": 1,
        "running": 1,
        "needs_attention": 1,
        "released": 1,
        "removed": 1,
    }


def test_discover_issue_ids_deduplicates_nested_canonical_results():
    ids = discover_issue_ids(
        {
            "waves": [
                {"issues": [{"issue_identifier": "REP-1"}, {"issue_identifier": "REP-2"}]},
                {"issues": [{"issue_identifier": "REP-1"}]},
            ],
            "deferred": [{"issue_identifier": "REP-3"}],
            "items": [{"issue_identifier": "REP-4"}],
        }
    )

    assert ids == ["REP-1", "REP-2", "REP-3", "REP-4"]


def test_parse_log_bundle_reads_engine_and_issue_events(tmp_path: Path):
    engine_log = tmp_path / "engine.log"
    engine_log.write_text("line-1\nline-2\n", encoding="utf-8")
    issue_events = tmp_path / "runs" / "REP-1-attempt-1" / "events.jsonl"
    issue_events.parent.mkdir(parents=True)
    issue_events.write_text(
        json.dumps({"kind": "phase-start", "issue_identifier": "REP-1"}) + "\n",
        encoding="utf-8",
    )

    bundle = parse_log_bundle(engine_log, [issue_events])

    assert bundle["engine"]["path"] == str(engine_log)
    assert bundle["engine"]["lines"] == ["line-1", "line-2"]
    assert bundle["issues"][0]["events"][0]["kind"] == "phase-start"
