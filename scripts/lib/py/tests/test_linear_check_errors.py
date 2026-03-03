"""Tests for linear_check_errors.py."""

import json

from conftest import run_script


def test_no_errors_exits_zero():
    payload = json.dumps({"data": {"issueSearch": {"nodes": []}}})
    result = run_script("linear_check_errors.py", stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == ""


def test_empty_errors_list_exits_zero():
    payload = json.dumps({"data": {}, "errors": []})
    result = run_script("linear_check_errors.py", stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == ""


def test_errors_list_exits_one():
    errors = [{"message": "Something went wrong"}]
    payload = json.dumps({"data": None, "errors": errors})
    result = run_script("linear_check_errors.py", stdin=payload)
    assert result.returncode == 1
    parsed = json.loads(result.stdout)
    assert parsed == errors


def test_errors_string_exits_one():
    payload = json.dumps({"errors": "Unauthorized"})
    result = run_script("linear_check_errors.py", stdin=payload)
    assert result.returncode == 1
    parsed = json.loads(result.stdout)
    assert parsed == "Unauthorized"


def test_no_errors_key_exits_zero():
    payload = json.dumps({"data": {"something": True}})
    result = run_script("linear_check_errors.py", stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == ""


def test_errors_none_exits_zero():
    payload = json.dumps({"data": {}, "errors": None})
    result = run_script("linear_check_errors.py", stdin=payload)
    assert result.returncode == 0
    assert result.stdout.strip() == ""
