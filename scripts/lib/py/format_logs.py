#!/usr/bin/env python3
"""Filter and format Tilt logstore output.

Reads the full Tilt logstore JSON from stdin and prints filtered,
formatted log lines to stdout.  Supports resource filtering, log-level
filtering, time-range filtering (--since), grep with temporal context
windows, tail, and JSON output mode.

Environment variables:
  RESOURCES      -- JSON array of resource names to include (default "[]")
  SOURCE_FILTER  -- "all", "build", or "runtime" (default "all")
  LEVEL_FILTER   -- "", "warn", or "error" (default "")
  SINCE_FILTER   -- duration (e.g. "5m") or ISO-8601 timestamp (default "")
  GREP_PATTERN   -- regex pattern to match against log messages (default "")
  CONTEXT_BEFORE -- duration before grep matches (default "")
  CONTEXT_AFTER  -- duration after grep matches (default "")
  JSON_OUTPUT    -- "true" for structured JSON output (default "false")
  NO_PREFIX      -- "true" to omit resource name prefix (default "false")
  TAIL_LINES     -- number of lines to tail (default "")
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone


def parse_duration(s):
    if not s:
        return None
    m = re.fullmatch(r"(\d+)([smhd])", s)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        mult = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        return timedelta(seconds=n * mult[unit])
    return None


def parse_since(s):
    if not s:
        return None
    dur = parse_duration(s)
    if dur:
        return datetime.now(timezone.utc) - dur
    try:
        return datetime.fromisoformat(normalize_ts(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_ts(s):
    """Normalize ISO-8601 fractional seconds to 6 digits for Python <3.11."""
    m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d+)(.*)", s)
    if m:
        frac = m.group(2)[:6].ljust(6, "0")
        return m.group(1) + "." + frac + m.group(3)
    return s


def parse_ts(ts_str):
    try:
        return datetime.fromisoformat(normalize_ts(ts_str).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


resources = json.loads(os.environ.get("RESOURCES", "[]"))
source_filter = os.environ.get("SOURCE_FILTER", "all")
level_filter = os.environ.get("LEVEL_FILTER", "")
since_filter = os.environ.get("SINCE_FILTER", "")
grep_pattern = os.environ.get("GREP_PATTERN", "")
ctx_before = os.environ.get("CONTEXT_BEFORE", "")
ctx_after = os.environ.get("CONTEXT_AFTER", "")
json_output = os.environ.get("JSON_OUTPUT", "false") == "true"
no_prefix = os.environ.get("NO_PREFIX", "false") == "true"
tail_lines = os.environ.get("TAIL_LINES", "")

since_dt = parse_since(since_filter)
ctx_b = parse_duration(ctx_before)
ctx_a = parse_duration(ctx_after)
use_context = bool(grep_pattern and (ctx_b or ctx_a))


def severity_to_level(sev):
    if sev >= 500:
        return "ERROR"
    if sev >= 400:
        return "WARN"
    return "INFO"


try:
    logstore = json.load(sys.stdin)
except json.JSONDecodeError:
    print("Error: failed to parse logstore JSON", file=sys.stderr)
    sys.exit(1)

span_map = {}
for span_id, span in logstore.get("spans", {}).items():
    span_map[span_id] = span.get("ManifestName", "")

segments = logstore.get("segments", [])

lines = []
for seg in segments:
    span_id = seg.get("SpanID", "")
    resource = span_map.get(span_id, "")
    text = seg.get("Text", "").rstrip("\n")
    ts_str = seg.get("Time", "")
    level_obj = seg.get("Level", {})
    level = severity_to_level(
        level_obj.get("severity", 0) if isinstance(level_obj, dict) else 0
    )
    fields = seg.get("Fields", {}) or {}
    is_build = "buildEvent" in fields

    if resources and resource not in resources:
        continue

    if source_filter != "all":
        if source_filter == "build" and not is_build:
            continue
        if source_filter == "runtime" and is_build:
            continue

    if level_filter:
        if level_filter == "error" and level != "ERROR":
            continue
        if level_filter == "warn" and level not in ("WARN", "ERROR"):
            continue

    ts = parse_ts(ts_str)
    if since_dt and ts and ts < since_dt:
        continue

    lines.append(
        {
            "timestamp": ts_str,
            "resource": resource,
            "level": level,
            "message": text,
            "ts": ts,
        }
    )

if use_context:
    match_indices = set()
    for i, line in enumerate(lines):
        if re.search(grep_pattern, line["message"]):
            match_indices.add(i)

    if not match_indices:
        sys.exit(0)

    windows = []
    for i in sorted(match_indices):
        ts = lines[i]["ts"]
        if ts:
            start = ts - ctx_b if ctx_b else ts
            end = ts + ctx_a if ctx_a else ts
            windows.append((start, end))

    merged = []
    for start, end in sorted(windows):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    for i, line in enumerate(lines):
        ts = line["ts"]
        if not ts:
            continue
        in_window = any(s <= ts <= e for s, e in merged)
        if not in_window:
            continue
        is_match = i in match_indices
        if json_output:
            obj = {k: v for k, v in line.items() if k != "ts"}
            obj["match"] = is_match
            print(json.dumps(obj))
        else:
            prefix = "" if no_prefix else line["resource"] + "  "
            marker = "> " if is_match else "  "
            ts_short = (
                line["timestamp"][:19].replace("T", " ") if line["timestamp"] else ""
            )
            msg = line["message"]
            print(f"{marker}{prefix}{ts_short}  {msg}")
    sys.exit(0)

if grep_pattern:
    lines = [l for l in lines if re.search(grep_pattern, l["message"])]

if tail_lines:
    n = int(tail_lines)
    lines = lines[-n:]

for line in lines:
    if json_output:
        obj = {k: v for k, v in line.items() if k != "ts"}
        print(json.dumps(obj))
    else:
        prefix = "" if no_prefix else line["resource"] + "  "
        msg = line["message"]
        print(f"{prefix}{msg}")
