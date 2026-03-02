"""Tests for config_count.py."""

import json

from conftest import run_script


def test_counts_services():
    data = {"services": [{"name": "a"}, {"name": "b"}, {"name": "c"}]}
    result = run_script("config_count.py", stdin=json.dumps(data))
    assert result.returncode == 0
    assert result.stdout.strip() == "3"


def test_empty_services():
    data = {"services": []}
    result = run_script("config_count.py", stdin=json.dumps(data))
    assert result.returncode == 0
    assert result.stdout.strip() == "0"


def test_missing_services_key():
    data = {}
    result = run_script("config_count.py", stdin=json.dumps(data))
    assert result.returncode == 0
    assert result.stdout.strip() == "0"
