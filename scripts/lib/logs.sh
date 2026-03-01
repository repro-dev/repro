#!/bin/bash
#
# scripts/lib/logs.sh — service log access and streaming
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/services.sh to be loaded first (provides TILT_PORT,
# tilt_is_running, die, detect_worktree_slug, is_worktree, etc.)

# ── Helpers ─────────────────────────────────────────────────────────

list_tilt_resources() {
  tilt get uiresources --port "$TILT_PORT" -o name 2>/dev/null \
    | sed 's|^uiresource\.tilt\.dev/||'
}

validate_resources() {
  local available
  available="$(list_tilt_resources)"

  if [ -z "$available" ]; then
    echo "No resources found in Tilt." >&2
    return 1
  fi

  for res in "$@"; do
    if ! echo "$available" | grep -qx "$res"; then
      echo "Unknown resource: $res" >&2
      echo "" >&2
      echo "Available resources:" >&2
      echo "$available" | sed 's/^/  /' >&2
      return 1
    fi
  done
}

# ── Logstore processing ────────────────────────────────────────────

dump_logstore_filtered() {
  local resources_json="$1"
  local source_filter="$2"
  local level_filter="$3"
  local since_filter="$4"
  local grep_pattern="$5"
  local context_before="$6"
  local context_after="$7"
  local json_output="$8"
  local no_prefix="$9"
  local tail_lines="${10}"

  tilt dump logstore --port "$TILT_PORT" 2>/dev/null | \
    RESOURCES="$resources_json" \
    SOURCE_FILTER="$source_filter" \
    LEVEL_FILTER="$level_filter" \
    SINCE_FILTER="$since_filter" \
    GREP_PATTERN="$grep_pattern" \
    CONTEXT_BEFORE="$context_before" \
    CONTEXT_AFTER="$context_after" \
    JSON_OUTPUT="$json_output" \
    NO_PREFIX="$no_prefix" \
    TAIL_LINES="$tail_lines" \
    python3 -c '
import json, os, re, sys
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

# Build span-id → manifest (resource) name lookup
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
    level = severity_to_level(level_obj.get("severity", 0) if isinstance(level_obj, dict) else 0)
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

    lines.append({
        "timestamp": ts_str,
        "resource": resource,
        "level": level,
        "message": text,
        "ts": ts,
    })

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
            ts_short = line["timestamp"][:19].replace("T", " ") if line["timestamp"] else ""
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
'
}

# ── Main command ────────────────────────────────────────────────────

cmd_logs() {
  local follow=false
  local level=""
  local source_filter="all"
  local grep_pattern=""
  local context_before=""
  local context_after=""
  local since=""
  local json_output=false
  local no_prefix=false
  local tail_lines=""
  local services=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--follow)
        follow=true
        shift
        ;;
      --level)
        [ $# -ge 2 ] || die "--level requires a value (warn|error)"
        level="$2"
        shift 2
        ;;
      --source)
        [ $# -ge 2 ] || die "--source requires a value (all|build|runtime)"
        source_filter="$2"
        shift 2
        ;;
      --grep)
        [ $# -ge 2 ] || die "--grep requires a pattern"
        grep_pattern="$2"
        shift 2
        ;;
      -C|--context)
        [ $# -ge 2 ] || die "-C/--context requires a duration (e.g. 10s)"
        context_before="$2"
        context_after="$2"
        shift 2
        ;;
      -B)
        [ $# -ge 2 ] || die "-B requires a duration (e.g. 30s)"
        context_before="$2"
        shift 2
        ;;
      -A)
        [ $# -ge 2 ] || die "-A requires a duration (e.g. 5s)"
        context_after="$2"
        shift 2
        ;;
      --since)
        [ $# -ge 2 ] || die "--since requires a duration or timestamp"
        since="$2"
        shift 2
        ;;
      --json)
        json_output=true
        shift
        ;;
      --no-prefix)
        no_prefix=true
        shift
        ;;
      -n|--tail)
        [ $# -ge 2 ] || die "-n/--tail requires a number"
        tail_lines="$2"
        shift 2
        ;;
      -h|--help)
        logs_usage
        return 0
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl logs --help' for usage."
        ;;
      *)
        services+=("$1")
        shift
        ;;
    esac
  done

  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  if [ -n "$context_before" ] || [ -n "$context_after" ]; then
    if [ -z "$grep_pattern" ]; then
      echo "Warning: -A/-B/-C ignored without --grep" >&2
      context_before=""
      context_after=""
    fi
  fi

  local resolved=()
  if [ "${#services[@]}" -gt 0 ]; then
    while IFS= read -r name; do
      resolved+=("$name")
    done < <(resolve_worktree_resource_names "${services[@]}")

    validate_resources "${resolved[@]}" || exit 1
  fi

  local needs_logstore=false
  if [ "$json_output" = true ] || [ -n "$tail_lines" ] || \
     [ -n "$context_before" ] || [ -n "$context_after" ]; then
    needs_logstore=true
  fi

  if [ "$follow" = false ] && [ -z "$since" ] && [ -z "$grep_pattern" ] && \
     [ "$needs_logstore" = false ]; then
    if [ "${#services[@]}" -eq 0 ]; then
      tail_lines="50"
      needs_logstore=true
    fi
  fi

  if [ "$needs_logstore" = true ] || { [ "$follow" = false ] && { [ -n "$since" ] || [ -n "$grep_pattern" ]; }; }; then
    local resources_json="[]"
    if [ "${#resolved[@]}" -gt 0 ]; then
      resources_json=$(printf '%s\n' "${resolved[@]}" | python3 -c "import json, sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
    fi

    dump_logstore_filtered \
      "$resources_json" \
      "$source_filter" \
      "$level" \
      "$since" \
      "$grep_pattern" \
      "$context_before" \
      "$context_after" \
      "$json_output" \
      "$no_prefix" \
      "$tail_lines"
    return
  fi

  local tilt_args=()

  if [ "$follow" = true ]; then
    tilt_args+=("-f")
  fi

  if [ -n "$level" ]; then
    tilt_args+=("--level" "$level")
  fi

  if [ "$source_filter" != "all" ]; then
    tilt_args+=("--source" "$source_filter")
  fi

  if [ "$no_prefix" = true ]; then
    tilt_args+=("--no-prefix")
  fi

  if [ "${#resolved[@]}" -gt 0 ]; then
    for res in "${resolved[@]}"; do
      tilt_args+=("$res")
    done
  fi

  tilt_args+=("--port" "$TILT_PORT")

  if [ -n "$since" ] && [ "$follow" = true ]; then
    local resources_json="[]"
    if [ "${#resolved[@]}" -gt 0 ]; then
      resources_json=$(printf '%s\n' "${resolved[@]}" | python3 -c "import json, sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
    fi

    dump_logstore_filtered \
      "$resources_json" \
      "$source_filter" \
      "$level" \
      "$since" \
      "$grep_pattern" \
      "" \
      "" \
      "false" \
      "$no_prefix" \
      ""

    tilt logs "${tilt_args[@]}"
    return
  fi

  if [ -n "$grep_pattern" ] && [ "$follow" = true ]; then
    tilt logs "${tilt_args[@]}" | grep --line-buffered -E "$grep_pattern"
  else
    tilt logs "${tilt_args[@]}"
  fi
}

logs_usage() {
  cat <<'EOF'
Usage: reproctl logs [options] [service...]

Show logs from Tilt-managed services.

Options:
  -f, --follow             Stream logs continuously (like tail -f)
  --level <warn|error>     Filter by log level
  --source <all|build|runtime>
                           Filter by log source (default: all)
  --grep <pattern>         Filter log lines matching a pattern
  -C, --context <duration> Time window around grep matches (e.g. 10s)
  -B <duration>            Time window before grep matches
  -A <duration>            Time window after grep matches
  --since <duration|timestamp>
                           Show logs newer than duration (e.g. 5m) or timestamp
  --json                   Output structured JSON (one object per line)
  --no-prefix              Omit resource name prefix
  -n, --tail <lines>       Show only last N lines (snapshot mode)

Without -f or services, shows the last 50 lines across all resources.

Examples:
  reproctl logs -f                           Tail all logs
  reproctl logs -f api-server                Tail a specific service
  reproctl logs api-server                   Snapshot current logs
  reproctl logs --level error                Filter by level
  reproctl logs --json api-server            Structured JSON output
  reproctl logs --grep "FATAL" -C 10s api-server
                                             Time-context around matches
  reproctl logs --since 5m api-server        Logs from last 5 minutes
  reproctl logs -n 100 api-server            Last 100 lines
EOF
}
