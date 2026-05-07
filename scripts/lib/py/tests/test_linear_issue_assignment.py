"""Tests for linear_issue_assignment.py."""

import json

from conftest import run_script


def test_extracts_issue_and_assignee_ids():
    payload = json.dumps(
        {
            "data": {
                "issues": {
                    "nodes": [
                        {
                            "id": "issue-uuid-1",
                            "assignee": {"id": "viewer-1"},
                        }
                    ]
                }
            }
        }
    )

    result = run_script("linear_issue_assignment.py", stdin=payload)

    assert result.returncode == 0
    assert result.stdout.split("\n")[:2] == ["issue-uuid-1", "viewer-1"]


def test_returns_empty_assignee_when_unassigned():
    payload = json.dumps(
        {"data": {"issues": {"nodes": [{"id": "issue-uuid-1", "assignee": None}]}}}
    )

    result = run_script("linear_issue_assignment.py", stdin=payload)

    assert result.returncode == 0
    assert result.stdout.split("\n")[:2] == ["issue-uuid-1", ""]


def test_fails_when_no_nodes_are_returned():
    payload = json.dumps({"data": {"issues": {"nodes": []}}})

    result = run_script("linear_issue_assignment.py", stdin=payload)

    assert result.returncode != 0
