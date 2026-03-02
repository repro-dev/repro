"""Tests for format_logs.py.

Covers both the importable helper functions (direct unit tests) and
the full script behaviour (subprocess integration tests).
"""

import json
import sys
from datetime import timedelta
from pathlib import Path

import pytest

from conftest import run_script

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from format_logs import (
    normalize_ts,
    parse_duration,
    parse_ts,
    severity_to_level,
)


# ── Helper unit tests ───────────────────────────────────────────────


class TestParseDuration:
    def test_seconds(self):
        assert parse_duration("30s") == timedelta(seconds=30)

    def test_minutes(self):
        assert parse_duration("5m") == timedelta(minutes=5)

    def test_hours(self):
        assert parse_duration("2h") == timedelta(hours=2)

    def test_days(self):
        assert parse_duration("1d") == timedelta(days=1)

    def test_empty_string(self):
        assert parse_duration("") is None

    def test_none(self):
        assert parse_duration(None) is None

    def test_invalid(self):
        assert parse_duration("abc") is None

    def test_no_unit(self):
        assert parse_duration("123") is None


class TestNormalizeTs:
    def test_pads_short_fractional(self):
        assert normalize_ts("2025-01-01T00:00:00.1Z") == "2025-01-01T00:00:00.100000Z"

    def test_truncates_long_fractional(self):
        assert (
            normalize_ts("2025-01-01T00:00:00.123456789Z")
            == "2025-01-01T00:00:00.123456Z"
        )

    def test_passthrough_no_fractional(self):
        assert normalize_ts("2025-01-01T00:00:00Z") == "2025-01-01T00:00:00Z"

    def test_preserves_offset(self):
        result = normalize_ts("2025-01-01T00:00:00.1+05:00")
        assert result == "2025-01-01T00:00:00.100000+05:00"


class TestParseTs:
    def test_valid_utc(self):
        dt = parse_ts("2025-06-15T10:30:00Z")
        assert dt is not None
        assert dt.hour == 10
        assert dt.minute == 30

    def test_with_fractional(self):
        dt = parse_ts("2025-06-15T10:30:00.123Z")
        assert dt is not None

    def test_invalid(self):
        assert parse_ts("not-a-date") is None

    def test_none(self):
        assert parse_ts(None) is None


class TestSeverityToLevel:
    def test_error(self):
        assert severity_to_level(500) == "ERROR"
        assert severity_to_level(600) == "ERROR"

    def test_warn(self):
        assert severity_to_level(400) == "WARN"
        assert severity_to_level(499) == "WARN"

    def test_info(self):
        assert severity_to_level(0) == "INFO"
        assert severity_to_level(399) == "INFO"


# ── Subprocess integration tests ────────────────────────────────────


def _logstore(segments, spans=None):
    """Build a minimal logstore JSON structure."""
    if spans is None:
        span_ids = {seg.get("SpanID", "") for seg in segments}
        spans = {}
        for sid in span_ids:
            if sid:
                spans[sid] = {"ManifestName": sid}
    return {"spans": spans, "segments": segments}


def _seg(resource, text, time="2025-06-15T10:00:00Z", severity=0, fields=None):
    seg = {
        "SpanID": resource,
        "Text": text + "\n",
        "Time": time,
        "Level": {"severity": severity},
    }
    if fields:
        seg["Fields"] = fields
    return seg


class TestFormatLogsBasic:
    def test_plain_output(self):
        store = _logstore([_seg("web", "hello world")])
        result = run_script("format_logs.py", stdin=json.dumps(store))
        assert result.returncode == 0
        assert "web" in result.stdout
        assert "hello world" in result.stdout

    def test_no_prefix(self):
        store = _logstore([_seg("web", "hello")])
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"NO_PREFIX": "true"},
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "hello"

    def test_json_output(self):
        store = _logstore([_seg("web", "msg")])
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"JSON_OUTPUT": "true"},
        )
        assert result.returncode == 0
        obj = json.loads(result.stdout)
        assert obj["resource"] == "web"
        assert obj["message"] == "msg"

    def test_empty_logstore(self):
        store = _logstore([])
        result = run_script("format_logs.py", stdin=json.dumps(store))
        assert result.returncode == 0
        assert result.stdout == ""

    def test_invalid_json(self):
        result = run_script("format_logs.py", stdin="not json")
        assert result.returncode == 1
        assert "Error" in result.stderr


class TestFormatLogsResourceFilter:
    def test_filters_by_resource(self):
        store = _logstore(
            [
                _seg("web", "web msg"),
                _seg("api", "api msg"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"RESOURCES": '["web"]', "NO_PREFIX": "true"},
        )
        assert "web msg" in result.stdout
        assert "api msg" not in result.stdout

    def test_empty_resources_shows_all(self):
        store = _logstore([_seg("web", "w"), _seg("api", "a")])
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"RESOURCES": "[]", "NO_PREFIX": "true"},
        )
        assert "w" in result.stdout
        assert "a" in result.stdout


class TestFormatLogsSourceFilter:
    def test_build_only(self):
        store = _logstore(
            [
                _seg("web", "build msg", fields={"buildEvent": True}),
                _seg("web", "runtime msg"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"SOURCE_FILTER": "build", "NO_PREFIX": "true"},
        )
        assert "build msg" in result.stdout
        assert "runtime msg" not in result.stdout

    def test_runtime_only(self):
        store = _logstore(
            [
                _seg("web", "build msg", fields={"buildEvent": True}),
                _seg("web", "runtime msg"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"SOURCE_FILTER": "runtime", "NO_PREFIX": "true"},
        )
        assert "runtime msg" in result.stdout
        assert "build msg" not in result.stdout


class TestFormatLogsLevelFilter:
    def test_error_filter(self):
        store = _logstore(
            [
                _seg("web", "info msg", severity=0),
                _seg("web", "warn msg", severity=400),
                _seg("web", "error msg", severity=500),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"LEVEL_FILTER": "error", "NO_PREFIX": "true"},
        )
        assert "error msg" in result.stdout
        assert "warn msg" not in result.stdout
        assert "info msg" not in result.stdout

    def test_warn_filter_includes_errors(self):
        store = _logstore(
            [
                _seg("web", "info msg", severity=0),
                _seg("web", "warn msg", severity=400),
                _seg("web", "error msg", severity=500),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"LEVEL_FILTER": "warn", "NO_PREFIX": "true"},
        )
        assert "error msg" in result.stdout
        assert "warn msg" in result.stdout
        assert "info msg" not in result.stdout


class TestFormatLogsSinceFilter:
    def test_filters_old_entries(self):
        store = _logstore(
            [
                _seg("web", "old", time="2020-01-01T00:00:00Z"),
                _seg("web", "new", time="2025-12-01T00:00:00Z"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"SINCE_FILTER": "2025-06-01T00:00:00Z", "NO_PREFIX": "true"},
        )
        assert "new" in result.stdout
        assert "old" not in result.stdout


class TestFormatLogsGrep:
    def test_basic_grep(self):
        store = _logstore(
            [
                _seg("web", "error: something broke"),
                _seg("web", "info: all good"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"GREP_PATTERN": "error:", "NO_PREFIX": "true"},
        )
        assert "something broke" in result.stdout
        assert "all good" not in result.stdout

    def test_grep_with_context(self):
        store = _logstore(
            [
                _seg("web", "before", time="2025-06-15T10:00:00Z"),
                _seg("web", "MATCH", time="2025-06-15T10:00:05Z"),
                _seg("web", "after", time="2025-06-15T10:00:10Z"),
                _seg("web", "far away", time="2025-06-15T11:00:00Z"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={
                "GREP_PATTERN": "MATCH",
                "CONTEXT_BEFORE": "10s",
                "CONTEXT_AFTER": "10s",
                "NO_PREFIX": "true",
            },
        )
        assert "before" in result.stdout
        assert "MATCH" in result.stdout
        assert "after" in result.stdout
        assert "far away" not in result.stdout

    def test_grep_context_match_marker(self):
        store = _logstore(
            [
                _seg("web", "before", time="2025-06-15T10:00:00Z"),
                _seg("web", "MATCH", time="2025-06-15T10:00:05Z"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={
                "GREP_PATTERN": "MATCH",
                "CONTEXT_BEFORE": "10s",
            },
        )
        lines = result.stdout.rstrip("\n").splitlines()
        before_line = [l for l in lines if "before" in l][0]
        match_line = [l for l in lines if "MATCH" in l][0]
        assert before_line.startswith("  ")
        assert match_line.startswith("> ")

    def test_grep_context_json_output(self):
        store = _logstore(
            [
                _seg("web", "before", time="2025-06-15T10:00:00Z"),
                _seg("web", "MATCH", time="2025-06-15T10:00:05Z"),
            ]
        )
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={
                "GREP_PATTERN": "MATCH",
                "CONTEXT_BEFORE": "10s",
                "JSON_OUTPUT": "true",
            },
        )
        objs = [json.loads(l) for l in result.stdout.strip().splitlines()]
        match_obj = [o for o in objs if o["message"] == "MATCH"][0]
        context_obj = [o for o in objs if o["message"] == "before"][0]
        assert match_obj["match"] is True
        assert context_obj["match"] is False

    def test_grep_no_matches_empty_output(self):
        store = _logstore([_seg("web", "hello")])
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={
                "GREP_PATTERN": "NOMATCH",
                "CONTEXT_BEFORE": "10s",
            },
        )
        assert result.returncode == 0
        assert result.stdout == ""


class TestFormatLogsTail:
    def test_tail_limits_output(self):
        store = _logstore([_seg("web", f"line {i}") for i in range(10)])
        result = run_script(
            "format_logs.py",
            stdin=json.dumps(store),
            env={"TAIL_LINES": "3", "NO_PREFIX": "true"},
        )
        lines = [l for l in result.stdout.strip().splitlines() if l.strip()]
        assert len(lines) == 3
        assert "line 7" in lines[0]
        assert "line 8" in lines[1]
        assert "line 9" in lines[2]
