#!/bin/bash
# scripts/lib/tests/test_autonomy_sequence.sh
#
# Regression tests for autonomous sequencing orchestration.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTONOMY_SH="$TESTS_DIR/../autonomy.sh"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_autonomy_sequence
}

_write_runner() {
  local tmpdir="$1"
  local extra="${2:-}"

  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "\$*" >&2; }
_ok() { printf '✔ %s\n' "\$*" >&2; }
_step() { :; }
_warn() { :; }
CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
tmpdir="$tmpdir"
mkdir -p "$tmpdir/repro" "$tmpdir/tmp"
slugify() { printf '%s\n' "\$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "\${WORKSPACE_ROOT:-\$PARENT_DIR}/repro-wt-\$1"; }
source "$WORKTREE_SH"
source "$AUTONOMY_SH"
$extra
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

test_sequence_writes_artifacts_and_keeps_blocked_context() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$1 $2 $3 $4" in
    "issue list --status backlog")
      cat <<'"'"'JSON'"'"'
{"items":[{"identifier":"REP-2","priority":1,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"},"relations":{"blockedBy":[]}}]}
JSON
      ;;
    "issue list --status todo")
      cat <<'"'"'JSON'"'"'
{"items":[{"identifier":"REP-3","priority":2,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"todo"},"relations":{"blockedBy":[{"identifier":"REP-2","status":{"type":"started"}}]}}]}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

cmd_opencode() {
  printf '%s\n' "$*" > "$tmpdir/opencode-args.txt"
  cat <<'JSON'
{"schema_version":1,"waves":[{"name":"wave-1","issues":[{"issue_identifier":"REP-2","rationale":"eligible first"}],"rationale":"start with the unblocked issue"}],"deferred":[{"issue_identifier":"REP-3","reason":"blocked-by:REP-2","rationale":"retain blocker context"}],"risk_notes":["blocked issue stays in the downstream handoff"]}
JSON
}

REPRO_OPENCODE_PROFILE=alpha cmd_autonomy sequence --limit 2 --output-dir "$tmpdir/sequences" --profile alpha --json
'

  bash "$tmpdir/run_test.sh" >"$tmpdir/stdout.json" 2>"$tmpdir/stderr.txt" || rc=$?
  output="$(cat "$tmpdir/stderr.txt" 2>/dev/null)"

  if [ $rc -ne 0 ]; then
    rm -rf "$tmpdir"
    _fail 'cmd_autonomy sequence runs and writes artifacts' "rc=$rc; output=$output"
    return 0
  fi

  if ! python3 - "$tmpdir" <<'PY'
import json
import sys
from pathlib import Path

tmpdir = Path(sys.argv[1])
stdout = json.loads((tmpdir / 'stdout.json').read_text())

latest = tmpdir / 'sequences' / 'latest.json'
canonical = json.loads(latest.read_text())
assert stdout == canonical, (stdout, canonical)
assert canonical['schema_version'] == 1, canonical
assert canonical['artifacts']['latest_path'] == str(latest), canonical['artifacts']
assert canonical['waves'][0]['issues'][0]['issue_identifier'] == 'REP-2', canonical['waves']
assert canonical['deferred'][0]['issue_identifier'] == 'REP-3', canonical['deferred']
assert canonical['deferred'][0]['reason'] == 'blocked-by:REP-2', canonical['deferred']

args = (tmpdir / 'opencode-args.txt').read_text().strip()
assert '--agent sequencer' in args, args
assert '--profile alpha' in args, args

prompt_path = Path(canonical['artifacts']['prompt_path'])
raw_path = Path(canonical['artifacts']['raw_response_path'])
canonical_path = Path(canonical['artifacts']['canonical_path'])
assert prompt_path.exists(), prompt_path
assert raw_path.exists(), raw_path
assert canonical_path.exists(), canonical_path
prompt_text = prompt_path.read_text()
raw_text = raw_path.read_text()
assert 'candidate evaluation json' in prompt_text.lower(), prompt_text
assert 'REP-2' in prompt_text, prompt_text
assert 'REP-3' in prompt_text, prompt_text
assert 'retain blocker context' in raw_text, raw_text
assert json.loads(canonical_path.read_text()) == canonical, canonical_path.read_text()
PY
  then
    rm -rf "$tmpdir"
    _fail 'cmd_autonomy sequence runs and writes artifacts' 'sequence artifacts were not written as expected'
    return 0
  fi

  rm -rf "$tmpdir"
  _pass 'cmd_autonomy sequence runs and writes artifacts'
}

test_sequence_writes_artifacts_and_keeps_blocked_context

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
