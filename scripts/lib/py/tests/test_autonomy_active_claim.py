"""Tests for autonomy_active_claim.py."""

from __future__ import annotations

import json

from conftest import run_script


def test_returns_first_active_claim():
    result = run_script(
        "autonomy_active_claim.py",
        args=["REP-1"],
        stdin=json.dumps(
            {
                "items": [
                    {"issue_identifier": "REP-1", "claim_state": "claimed"},
                    {"issue_identifier": "REP-2", "claim_state": "released"},
                ]
            }
        ),
    )

    assert result.returncode == 0
    assert json.loads(result.stdout) == {"issue_identifier": "REP-1", "claim_state": "claimed"}


def test_returns_nonzero_when_no_active_claim_exists():
    result = run_script(
        "autonomy_active_claim.py",
        args=["REP-1"],
        stdin=json.dumps({"items": [{"issue_identifier": "REP-1", "claim_state": "released"}]}),
    )

    assert result.returncode == 1
