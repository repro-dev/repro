"""Tests for linear_format_issue_bundle.py."""

import json

from conftest import run_script

SCRIPT = "linear_format_issue_bundle.py"


def _make_issue_response(
    *, identifier="REP-123", title="My issue", description="Some details"
):
    return json.dumps(
        {
            "data": {
                "issue": {
                    "id": "uuid-1",
                    "identifier": identifier,
                    "title": title,
                    "description": description,
                }
            }
        }
    )


def _make_search_response(nodes):
    return json.dumps({"data": {"issues": {"nodes": nodes}}})


def test_formats_issue_title_and_description():
    payload = _make_issue_response(
        title="Fix the widget", description="The widget is broken.\nPlease fix it."
    )
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert "Title: Fix the widget" in result.stdout
    assert "The widget is broken." in result.stdout
    assert "Please fix it." in result.stdout


def test_empty_description():
    payload = _make_issue_response(description="")
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert "Title: My issue" in result.stdout
    assert "Description:" not in result.stdout


def test_no_issue_data_produces_no_output():
    payload = json.dumps({"data": {}})
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == ""


def test_issues_fallback():
    nodes = [
        {
            "id": "uuid-1",
            "identifier": "REP-456",
            "title": "Search result",
            "description": "Found via search.",
        }
    ]
    payload = _make_search_response(nodes)
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert "Title: Search result" in result.stdout
    assert "Found via search." in result.stdout


def test_empty_search_nodes_produces_no_output():
    payload = _make_search_response([])
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == ""


def test_long_description_is_truncated():
    long_desc = "Line of text\n" * 200
    payload = _make_issue_response(description=long_desc)
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert "[...truncated]" in result.stdout
    desc_section = result.stdout.split("Description:\n", 1)[1]
    assert len(desc_section) < 1600


def test_missing_fields_handled_gracefully():
    payload = json.dumps({"data": {"issue": {"id": "uuid-1"}}})
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert "Title: " in result.stdout


def test_null_field_values():
    """Explicit null values for title/description should not crash."""
    payload = json.dumps(
        {
            "data": {
                "issue": {
                    "id": "uuid-1",
                    "identifier": None,
                    "title": None,
                    "description": None,
                }
            }
        }
    )
    result = run_script(SCRIPT, stdin=payload)
    assert result.returncode == 0
    assert "Title: " in result.stdout
    assert "Description:" not in result.stdout
