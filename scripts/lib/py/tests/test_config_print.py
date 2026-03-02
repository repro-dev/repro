"""Tests for config_print.py."""

import json

from conftest import run_script


def test_prints_main_services():
    data = {"services": [{"name": "web", "slug": ""}, {"name": "api", "slug": ""}]}
    result = run_script("config_print.py", stdin=json.dumps(data))
    assert result.returncode == 0
    lines = result.stdout.rstrip("\n").splitlines()
    assert lines == ["  web (main)", "  api (main)"]


def test_prints_worktree_services():
    data = {"services": [{"name": "web", "slug": "feat-x"}]}
    result = run_script("config_print.py", stdin=json.dumps(data))
    assert result.returncode == 0
    assert "  web (wt: feat-x)" in result.stdout


def test_prints_none_for_empty():
    data = {"services": []}
    result = run_script("config_print.py", stdin=json.dumps(data))
    assert result.returncode == 0
    assert result.stdout.strip() == "(none)"


def test_mixed_main_and_worktree():
    data = {
        "services": [
            {"name": "web", "slug": ""},
            {"name": "api", "slug": "my-branch"},
        ]
    }
    result = run_script("config_print.py", stdin=json.dumps(data))
    lines = result.stdout.rstrip("\n").splitlines()
    assert lines[0] == "  web (main)"
    assert lines[1] == "  api (wt: my-branch)"
