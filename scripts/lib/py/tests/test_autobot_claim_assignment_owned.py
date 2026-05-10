"""Tests for autobot_claim_assignment_owned.py."""

import json

from conftest import run_script


def test_reports_owned_claim_for_matching_issue():
    payload = json.dumps(
        {
            "items": [
                {"issue_identifier": "REP-1", "linear_assignment_owned": False},
                {"issue_identifier": "REP-2", "linear_assignment_owned": True},
            ]
        }
    )

    result = run_script("autobot_claim_assignment_owned.py", stdin=payload, args=["REP-2"])

    assert result.returncode == 0
    assert result.stdout.strip() == "true"


def test_reports_false_when_issue_is_missing():
    payload = json.dumps({"items": []})

    result = run_script("autobot_claim_assignment_owned.py", stdin=payload, args=["REP-2"])

    assert result.returncode == 0
    assert result.stdout.strip() == "false"
