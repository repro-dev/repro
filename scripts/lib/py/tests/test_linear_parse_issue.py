"""Tests for linear_parse_issue.py."""

import json

from conftest import run_script


def _make_response(nodes):
    """Build a Linear issueSearch response envelope."""
    return json.dumps({"data": {"issueSearch": {"nodes": nodes}}})


def _make_issue(
    *,
    issue_id="uuid-1",
    identifier="REP-123",
    title="My issue",
    branch="feat/REP-123-my-issue",
    states=None,
):
    if states is None:
        states = [
            {"id": "state-backlog", "name": "Backlog", "type": "backlog"},
            {"id": "state-in-progress", "name": "In Progress", "type": "started"},
            {"id": "state-done", "name": "Done", "type": "completed"},
        ]
    return {
        "id": issue_id,
        "identifier": identifier,
        "title": title,
        "branchName": branch,
        "team": {"states": {"nodes": states}},
    }


def test_parses_issue_with_in_progress_state():
    payload = _make_response([_make_issue()])
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    lines = result.stdout.split("\n")
    assert lines[0] == "uuid-1"
    assert lines[1] == "REP-123"
    assert lines[2] == "My issue"
    assert lines[3] == "feat/REP-123-my-issue"
    assert lines[4] == "state-in-progress"


def test_no_in_progress_state_returns_empty_state_id():
    issue = _make_issue(
        states=[
            {"id": "state-backlog", "name": "Backlog", "type": "backlog"},
            {"id": "state-done", "name": "Done", "type": "completed"},
        ]
    )
    payload = _make_response([issue])
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    lines = result.stdout.split("\n")
    assert lines[4] == ""


def test_not_found_when_no_nodes():
    payload = _make_response([])
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == "NOT_FOUND"


def test_not_found_when_missing_data():
    payload = json.dumps({"data": {}})
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == "NOT_FOUND"


def test_picks_first_node_when_multiple():
    nodes = [
        _make_issue(issue_id="first", identifier="REP-1", title="First"),
        _make_issue(issue_id="second", identifier="REP-2", title="Second"),
    ]
    payload = _make_response(nodes)
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    lines = result.stdout.split("\n")
    assert lines[0] == "first"
    assert lines[1] == "REP-1"


def test_empty_states_list():
    issue = _make_issue(states=[])
    payload = _make_response([issue])
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    lines = result.stdout.split("\n")
    assert lines[4] == ""


def test_only_matches_in_progress_by_name_and_type():
    """A state named 'In Progress' but with wrong type should not match."""
    issue = _make_issue(
        states=[
            {"id": "state-wrong", "name": "In Progress", "type": "completed"},
            {"id": "state-also-wrong", "name": "Started", "type": "started"},
        ]
    )
    payload = _make_response([issue])
    result = run_script("linear_parse_issue.py", stdin=payload)
    assert result.returncode == 0
    lines = result.stdout.split("\n")
    assert lines[4] == ""
