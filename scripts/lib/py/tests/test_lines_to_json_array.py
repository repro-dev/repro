"""Tests for lines_to_json_array.py."""

from conftest import run_script_json


def test_basic_lines():
    result = run_script_json("lines_to_json_array.py", stdin="foo\nbar\nbaz\n")
    assert result == ["foo", "bar", "baz"]


def test_strips_whitespace():
    result = run_script_json("lines_to_json_array.py", stdin="  foo  \n  bar  \n")
    assert result == ["foo", "bar"]


def test_drops_empty_lines():
    result = run_script_json("lines_to_json_array.py", stdin="foo\n\n\nbar\n\n")
    assert result == ["foo", "bar"]


def test_empty_input():
    result = run_script_json("lines_to_json_array.py", stdin="")
    assert result == []


def test_whitespace_only_input():
    result = run_script_json("lines_to_json_array.py", stdin="  \n  \n")
    assert result == []
