"""Tests for autonomy_monitor.py."""

from __future__ import annotations

import json
import sys
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from autonomy_monitor import evaluate_monitor_candidates, main


def _issue(
    identifier: str,
    *,
    priority: int | None = None,
    project: str = "Engineering",
    state_name: str = "Todo",
    state_type: str = "backlog",
    blockers: list[dict[str, object]] | None = None,
    relations: dict[str, object] | None = None,
) -> dict[str, object]:
    issue: dict[str, object] = {
        "identifier": identifier,
        "project": {"name": project},
        "state": {"name": state_name, "type": state_type},
    }
    if priority is not None:
        issue["priority"] = priority
    if blockers is not None:
        issue["blockers"] = blockers
    if relations is not None:
        issue["relations"] = relations
    return issue


def _claims(*items: dict[str, object]) -> dict[str, object]:
    return {"items": list(items)}


def test_evaluate_monitor_candidates_orders_by_priority_then_identifier():
    result = evaluate_monitor_candidates(
        {
            "issues": [
                _issue("REP-3", priority=3),
                _issue("REP-1", priority=1),
                _issue("REP-2", priority=1),
            ],
            "claims": _claims(),
        }
    )

    assert [item["issue_identifier"] for item in result["items"]] == [
        "REP-1",
        "REP-2",
        "REP-3",
    ]
    assert result["items"][0]["eligible"] is True
    assert result["summary"]["eligible_count"] == 3


def test_evaluate_monitor_candidates_sorts_missing_and_zero_priority_last():
    result = evaluate_monitor_candidates(
        {
            "issues": [
                _issue("REP-3", priority=3),
                _issue("REP-1", priority=1),
                _issue("REP-0", priority=0),
                _issue("REP-MISSING"),
            ],
            "claims": _claims(),
        }
    )

    assert [item["issue_identifier"] for item in result["items"]] == [
        "REP-1",
        "REP-3",
        "REP-0",
        "REP-MISSING",
    ]
    assert result["items"][2]["priority"] == result["items"][3]["priority"]


def test_evaluate_monitor_candidates_marks_active_claim_and_terminal_blocker_notes():
    result = evaluate_monitor_candidates(
        {
            "issues": [
                _issue("REP-1", priority=1),
                _issue(
                    "REP-2",
                    priority=2,
                    relations={
                        "blockedBy": [
                            {"identifier": "REP-9", "status": {"type": "started"}},
                        ]
                    },
                ),
                _issue(
                    "REP-3",
                    priority=1,
                    relations={
                        "blockedBy": [
                            {"identifier": "REP-8", "status": {"type": "closed"}},
                        ]
                    },
                ),
            ],
            "claims": _claims(
                {
                    "issue_identifier": "REP-1",
                    "claim_state": "claimed",
                }
            ),
        }
    )

    by_id = {item["issue_identifier"]: item for item in result["items"]}

    assert by_id["REP-1"]["eligible"] is False
    assert "active-claim" in by_id["REP-1"]["reasons"]
    assert by_id["REP-2"]["eligible"] is False
    assert "blocked-by:REP-9" in by_id["REP-2"]["reasons"]
    assert by_id["REP-3"]["eligible"] is True
    assert "terminal-blockers-ignored" in by_id["REP-3"]["notes"]


def test_main_emits_json_and_limits_results(tmp_path: Path):
    payload = {
        "issues": [
            _issue("REP-5", priority=5),
            _issue("REP-1", priority=1),
        ],
        "claims": _claims(),
    }

    stdout = StringIO()
    with redirect_stdout(stdout):
        exit_code = main(
            ["--json", "--limit", "1"],
            input_text=json.dumps(payload),
        )

    result = json.loads(stdout.getvalue())
    assert exit_code == 0
    assert [item["issue_identifier"] for item in result["items"]] == ["REP-1"]
    assert result["summary"]["limit"] == 1
