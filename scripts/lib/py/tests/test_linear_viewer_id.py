"""Tests for linear_viewer_id.py."""

import json

from conftest import run_script


def test_extracts_viewer_id():
    payload = json.dumps({"data": {"viewer": {"id": "viewer-1"}}})

    result = run_script("linear_viewer_id.py", stdin=payload)

    assert result.returncode == 0
    assert result.stdout.strip() == "viewer-1"


def test_fails_when_viewer_is_missing():
    payload = json.dumps({"data": {"viewer": {}}})

    result = run_script("linear_viewer_id.py", stdin=payload)

    assert result.returncode != 0
