"""Tests for autonomy monitor output helpers."""

from __future__ import annotations

import json

from conftest import run_script


def test_issue_ids_helper_emits_eligible_ids_in_order():
    result = run_script(
        "autonomy_monitor_issue_ids.py",
        args=[
            json.dumps(
                {
                    "items": [
                        {"issue_identifier": "REP-2", "eligible": False},
                        {"issue_identifier": "REP-1", "eligible": True},
                        {"issue_identifier": "REP-3", "eligible": True},
                    ]
                }
            )
        ],
    )

    assert result.returncode == 0
    assert result.stdout.splitlines() == ["REP-1", "REP-3"]


def test_render_helper_prints_monitor_summary():
    result = run_script(
        "autonomy_monitor_render.py",
        args=[
            json.dumps(
                {
                    "items": [
                        {
                            "issue_identifier": "REP-1",
                            "priority": 1,
                            "eligible": True,
                            "action": "prepare",
                            "reasons": [],
                            "notes": ["terminal-blockers-ignored"],
                        }
                    ]
                }
            )
        ],
    )

    assert result.returncode == 0
    assert result.stdout.splitlines() == [
        "MONITOR",
        "  REP-1  priority=1  eligible  action=prepare  notes=terminal-blockers-ignored",
    ]
