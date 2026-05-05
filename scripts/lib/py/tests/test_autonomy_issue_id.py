"""Tests for autonomy_issue_id.py."""

from __future__ import annotations

import json

from conftest import run_script


def test_extracts_issue_uuid_from_issue_json():
    result = run_script("autonomy_issue_id.py", args=[json.dumps({"item": {"id": "uuid-1"}})])

    assert result.returncode == 0
    assert result.stdout.strip() == "uuid-1"


def test_rejects_missing_identifier():
    result = run_script("autonomy_issue_id.py", args=[json.dumps({"item": {}})])

    assert result.returncode == 1
