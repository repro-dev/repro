#!/bin/bash
# scripts/lib/tests/test_herdr.sh
#
# Integration tests for project-scoped Herdr commands.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"
REPROCTL_SH="$REPO_ROOT/scripts/reproctl.sh"
PASS=0
FAIL=0
SYSTEM_PATH='/usr/bin:/bin:/usr/sbin:/sbin'

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); }

_make_tmpdir() {
  mkdir -p "$REPO_ROOT/tmp"
  mktemp -d "$REPO_ROOT/tmp/test_herdr.XXXXXX"
}

_write_fixture() {
  local tmpdir="$1" repo="$1/repro"
  mkdir -p "$repo" "$tmpdir/bin" "$tmpdir/state"
  git init -q -b main "$repo"
  git -C "$repo" config user.email test@example.com
  git -C "$repo" config user.name Test
  if [ -f "$REPO_ROOT/.herdr/config.toml" ]; then
    mkdir -p "$repo/.herdr"
    cp "$REPO_ROOT/.herdr/config.toml" "$repo/.herdr/config.toml"
    git -C "$repo" add .herdr/config.toml
  fi
  : > "$repo/.linear"
  git -C "$repo" add .linear
  git -C "$repo" commit -q -m init

  cat > "$tmpdir/bin/herdr" <<'STUB'
#!/bin/bash
if [ "${1:-}" != "--session" ] || [ -z "${2:-}" ]; then
  echo "missing explicit --session: $*" >&2
  exit 90
fi
session="$2"
shift 2
printf 'CALL: --session %s %s\n' "$session" "$*" >> "$HERDR_STUB_LOG"
printf 'CONFIG: %s\n' "${HERDR_CONFIG_PATH:-}" >> "$HERDR_STUB_LOG"
if [ -z "${HERDR_CONFIG_PATH:-}" ]; then
  echo 'missing HERDR_CONFIG_PATH' >&2
  exit 91
fi
  case "${1:-}" in
  status)
    if [ "${HERDR_STUB_STATUS_FAIL:-0}" = "1" ]; then
      echo 'herdr: status probe failed' >&2
      exit 1
    fi
    if [ "${HERDR_STUB_STATUS_MALFORMED:-0}" = "1" ]; then
      printf '{malformed status json}\n'
      exit 0
    fi
    if [ "${HERDR_STUB_DOWN:-0}" = "1" ]; then
      printf '{"server":{"running":false,"status":"not_running"}}\n'
      exit 0
    fi
    printf '{"server":{"running":true,"status":"running"}}\n'
    exit 0
    ;;
  worktree)
    case "${2:-}" in
      list)
        if [ "${HERDR_STUB_LIST_FAIL:-0}" = "1" ]; then
          echo 'herdr: simulated worktree list failure' >&2
          exit 1
        fi
        if [ "${HERDR_STUB_LIST_MALFORMED:-0}" = "1" ]; then
          printf '{malformed worktree list json}\n'
          exit 0
        fi
        if [ "${HERDR_STUB_LIST_SCHEMA_INVALID:-0}" = "1" ]; then
          printf '{"result":{}}\n'
          exit 0
        fi
        if [ -s "$HERDR_STUB_REGISTRY" ]; then
          cat "$HERDR_STUB_REGISTRY"
        else
          printf '{"result":{"worktrees":[]}}\n'
        fi
        exit 0
        ;;
      open)
        if [ "${HERDR_STUB_OPEN_FAIL:-0}" = "1" ]; then
          echo 'herdr: simulated open failure' >&2
          exit 1
        fi
        cwd="" path=""
        while [ "$#" -gt 0 ]; do
          case "$1" in
            --cwd) cwd="$2"; shift 2 ;;
            --path) path="$2"; shift 2 ;;
            *) shift ;;
          esac
        done
        printf 'OPEN: cwd=%s path=%s args=%s\n' "$cwd" "$path" "$*" >> "$HERDR_STUB_LOG"
        printf '{"result":{"worktrees":[{"path":"%s","open_workspace_id":"ws-open"}]}}\n' "$path" > "$HERDR_STUB_REGISTRY"
        printf '{"result":{"workspace":{"workspace_id":"ws-open"}}}\n'
        exit 0
        ;;
    esac
    ;;
  workspace)
    if [ "${2:-}" = "report-metadata" ]; then
      exit 0
    fi
    ;;
  start|server)
    echo "unexpected daemon control command: $*" >&2
    exit 92
    ;;
esac
echo "unexpected Herdr command: $*" >&2
exit 93
STUB
  chmod +x "$tmpdir/bin/herdr"
}

_run_reproctl() {
  local checkout="$1" tmpdir="$2"
  shift 2
  (
    cd "$checkout"
    CALLER_PWD="$checkout" \
      HERDR_STUB_LOG="$tmpdir/herdr.log" \
      HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" \
      PATH="$tmpdir/bin:$PATH" \
      bash "$REPROCTL_SH" "$@"
  )
}

test_open_uses_project_config_and_current_checkout() {
  local tmpdir repo output rc=0 open_call
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"

  output="$(_run_reproctl "$repo" "$tmpdir" herdr open 2>&1)" || rc=$?
  open_call="$(grep '^CALL: .*worktree open ' "$tmpdir/herdr.log" 2>/dev/null || true)"

  if [ "$rc" -eq 0 ] \
    && printf '%s\n' "$open_call" | grep -qF -- "--cwd $repo --path $repo" \
    && printf '%s\n' "$open_call" | grep -qF -- '--no-focus --json' \
    && grep -F "CONFIG: $repo/.herdr/config.toml" "$tmpdir/herdr.log" >/dev/null \
    && ! grep -q 'workspace report-metadata' "$tmpdir/herdr.log" \
    && ! grep -q 'issue_title=' "$tmpdir/herdr.log" \
    && printf '%s\n' "$output" | grep -qi 'config.*unverified' \
    && ! grep -E '^CALL: .* (start|server stop|workspace close|worktree close)( |$)' "$tmpdir/herdr.log" >/dev/null; then
    _pass 'herdr open selects project config, opens current checkout, and reports active config as unverified'
  else
    _fail 'herdr open selects project config, opens current checkout, and reports active config as unverified' "rc=$rc; open=${open_call:-<absent>}; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true); output=$output"
  fi
  rm -rf "$tmpdir"
}

test_open_reuses_workspace_and_uses_one_named_session() {
  local tmpdir repo output1 output2 rc=0 open_count sessions
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"

  output1="$(_run_reproctl "$repo" "$tmpdir" herdr open 2>&1)" || rc=$?
  output2="$(_run_reproctl "$repo" "$tmpdir" herdr open 2>&1)" || rc=$?
  open_count="$(grep -c '^CALL: .*worktree open ' "$tmpdir/herdr.log" || true)"
  sessions="$(sed -n 's/^CALL: --session \([^ ]*\).*/\1/p' "$tmpdir/herdr.log" | sort -u | wc -l | tr -d ' ')"

  if [ "$rc" -eq 0 ] && [ "$open_count" -eq 1 ] && [ "$sessions" -eq 1 ] \
    && printf '%s\n' "$output2" | grep -q 'Reusing open herdr workspace'; then
    _pass 'herdr open reuses an existing canonical-path workspace in one deterministic named session'
  else
    _fail 'herdr open reuses an existing canonical-path workspace in one deterministic named session' "rc=$rc; opens=$open_count; session_count=$sessions; first=$output1; second=$output2; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
  fi
  rm -rf "$tmpdir"
}

test_registered_but_closed_worktree_is_opened_once() {
  local tmpdir repo closed_mode output rc open_count open_call
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"

  for closed_mode in OMITTED NULL; do
    : > "$tmpdir/herdr.log"
    if [ "$closed_mode" = OMITTED ]; then
      printf '{"result":{"worktrees":[{"path":"%s","branch":"main","head":"0123456789abcdef0123456789abcdef01234567"}]}}\n' \
        "$repo" > "$tmpdir/state/workspaces.json"
    else
      printf '{"result":{"worktrees":[{"path":"%s","branch":"main","head":"0123456789abcdef0123456789abcdef01234567","open_workspace_id":null}]}}\n' \
        "$repo" > "$tmpdir/state/workspaces.json"
    fi

    rc=0
    output="$(_run_reproctl "$repo" "$tmpdir" herdr open 2>&1)" || rc=$?
    open_count="$(grep -c '^CALL: .*worktree open ' "$tmpdir/herdr.log" 2>/dev/null || true)"
    open_call="$(grep '^CALL: .*worktree open ' "$tmpdir/herdr.log" 2>/dev/null || true)"

    if [ "$rc" -ne 0 ] || [ "$open_count" -ne 1 ] \
      || ! printf '%s\n' "$open_call" | grep -qF -- "--cwd $repo --path $repo" \
      || printf '%s\n' "$output" | grep -q 'worktree list could not be verified'; then
      _fail "registered Herdr worktree with $closed_mode open_workspace_id is opened exactly once" \
        "rc=$rc; opens=$open_count; open=${open_call:-<absent>}; output=$output; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
      rm -rf "$tmpdir"
      return
    fi
  done

  _pass 'registered Herdr worktree with omitted or null open_workspace_id and no row id is opened exactly once'
  rm -rf "$tmpdir"
}

test_reused_workspace_reports_nonempty_issue_title() {
  local tmpdir repo output rc=0 metadata open_count
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"
  printf '{"result":{"worktrees":[{"path":"%s","open_workspace_id":"ws-existing"}]}}\n' \
    "$repo" > "$tmpdir/state/workspaces.json"

  output="$(cd "$repo" && CALLER_PWD="$repo" REPROCTL_SCRIPTS_ROOT="$REPO_ROOT" \
    HERDR_STUB_LOG="$tmpdir/herdr.log" HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" \
    PATH="$tmpdir/bin:$PATH" bash -c '
      source "$REPROCTL_SCRIPTS_ROOT/scripts/lib/common.sh"
      source "$REPROCTL_SCRIPTS_ROOT/scripts/lib/herdr.sh"
      source "$REPROCTL_SCRIPTS_ROOT/scripts/lib/worktree.sh"
      _herdr_workspace_add_sibling "$REPO_ROOT" "repro" "Existing issue title" true
    ' 2>&1)" || rc=$?
  metadata="$(grep '^CALL: .*workspace report-metadata ws-existing ' "$tmpdir/herdr.log" || true)"
  open_count="$(grep -c '^CALL: .*worktree open ' "$tmpdir/herdr.log" || true)"

  if [ "$rc" -eq 0 ] && [ "$open_count" -eq 0 ] \
    && printf '%s\n' "$metadata" | grep -qF -- '--token issue_title=Existing issue title' \
    && printf '%s\n' "$output" | grep -q 'Reusing open herdr workspace'; then
    _pass 'reused workspace still reports a nonempty issue_title without reopening it'
  else
    _fail 'reused workspace still reports a nonempty issue_title without reopening it' \
      "rc=$rc; metadata=${metadata:-<absent>}; opens=$open_count; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true); output=$output"
  fi
  rm -rf "$tmpdir"
}

test_open_from_worktree_targets_worktree_and_parent_checkout() {
  local tmpdir repo wt output rc=0 open_call session
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"
  wt="$tmpdir/repro-wt-feature"
  git -C "$repo" worktree add -q -b feature "$wt" main

  output="$(_run_reproctl "$wt" "$tmpdir" herdr open 2>&1)" || rc=$?
  open_call="$(grep '^CALL: .*worktree open ' "$tmpdir/herdr.log" 2>/dev/null || true)"
  session="$(sed -n 's/^CALL: --session \([^ ]*\) worktree open.*/\1/p' <<< "$open_call")"

  if [ "$rc" -eq 0 ] \
    && printf '%s\n' "$open_call" | grep -qF -- "--cwd $repo --path $wt" \
    && [ -n "$session" ] \
    && grep -F "CONFIG: $wt/.herdr/config.toml" "$tmpdir/herdr.log" >/dev/null; then
    _pass 'herdr open uses the invocation worktree path and its main checkout as --cwd'
  else
    _fail 'herdr open uses the invocation worktree path and its main checkout as --cwd' "rc=$rc; open=${open_call:-<absent>}; log=$(cat "$tmpdir/herdr.log" 2>/dev/null || true); output=$output"
  fi
  rm -rf "$tmpdir"
}

test_missing_herdr_has_install_recovery() {
  local tmpdir repo output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"
  rm -f "$tmpdir/bin/herdr"

  output="$(cd "$repo" && CALLER_PWD="$repo" PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$REPROCTL_SH" herdr open 2>&1)" || rc=$?
  if [ "$rc" -ne 0 ] && printf '%s\n' "$output" | grep -q 'brew install herdr'; then
    _pass 'missing Herdr binary fails with brew install recovery'
  else
    _fail 'missing Herdr binary fails with brew install recovery' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_unavailable_daemon_has_session_scoped_recovery() {
  local tmpdir repo output rc=0 session expected_command
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"

  output="$(cd "$repo" && CALLER_PWD="$repo" HERDR_STUB_LOG="$tmpdir/herdr.log" \
    HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" HERDR_STUB_DOWN=1 \
    PATH="$tmpdir/bin:$PATH" bash "$REPROCTL_SH" herdr open 2>&1)" || rc=$?
  session="$(sed -n 's/^CALL: --session \([^ ]*\) status --json$/\1/p' "$tmpdir/herdr.log" | head -1)"
  expected_command="$(printf 'HERDR_CONFIG_PATH=%q herdr --session %q server' "$repo/.herdr/config.toml" "$session")"

  if [ "$rc" -ne 0 ] && [ -n "$session" ] \
    && printf '%s\n' "$output" | grep -qF "Start it in the foreground with: $expected_command" \
    && ! grep -Eq '^CALL: .* worktree (list|open)( |$)' "$tmpdir/herdr.log" \
    && ! grep -Eq '^CALL: .* (stop|server stop|workspace close|worktree close)( |$)' "$tmpdir/herdr.log"; then
    _pass 'unavailable daemon fails with config-scoped named-session recovery'
  else
    _fail 'unavailable daemon fails with config-scoped named-session recovery' "rc=$rc; session=${session:-<empty>}; output=$output; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
  fi
  rm -rf "$tmpdir"
}

test_status_failure_and_malformed_json_are_unavailable() {
  local status_mode tmpdir repo output rc session expected_command

  for status_mode in FAIL MALFORMED; do
    tmpdir="$(_make_tmpdir)"
    _write_fixture "$tmpdir"
    repo="$tmpdir/repro"
    rc=0
    output="$(cd "$repo" && env "HERDR_STUB_STATUS_${status_mode}=1" \
      CALLER_PWD="$repo" HERDR_STUB_LOG="$tmpdir/herdr.log" \
      HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" \
      PATH="$tmpdir/bin:$PATH" bash "$REPROCTL_SH" herdr open 2>&1)" || rc=$?
    session="$(sed -n 's/^CALL: --session \([^ ]*\) status --json$/\1/p' "$tmpdir/herdr.log" | head -1)"
    expected_command="$(printf 'HERDR_CONFIG_PATH=%q herdr --session %q server' "$repo/.herdr/config.toml" "$session")"

    if [ "$rc" -eq 0 ] || [ -z "$session" ] \
      || ! printf '%s\n' "$output" | grep -qF "Start it in the foreground with: $expected_command" \
      || grep -Eq '^CALL: .* worktree (list|open)( |$)' "$tmpdir/herdr.log" \
      || grep -Eq '^CALL: .* (stop|server stop|workspace close|worktree close)( |$)' "$tmpdir/herdr.log"; then
      _fail "Herdr $status_mode status response is unavailable without worktree calls" "rc=$rc; output=$output; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
      rm -rf "$tmpdir"
      return
    fi
    rm -rf "$tmpdir"
  done

  _pass 'command failure and malformed status JSON are unavailable without worktree calls'
}

test_required_open_fails_closed_when_workspace_list_is_unknown() {
  local list_mode schema_mode tmpdir repo output rc open_count

  for list_mode in FAIL MALFORMED SCHEMA_INVALID; do
    tmpdir="$(_make_tmpdir)"
    _write_fixture "$tmpdir"
    repo="$tmpdir/repro"
    printf '{"result":{"worktrees":[{"path":"%s","open_workspace_id":"ws-existing"}]}}\n' \
      "$repo" > "$tmpdir/state/workspaces.json"

    rc=0
    output="$(cd "$repo" && env "HERDR_STUB_LIST_${list_mode}=1" \
      CALLER_PWD="$repo" HERDR_STUB_LOG="$tmpdir/herdr.log" \
      HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" \
      PATH="$tmpdir/bin:$PATH" bash "$REPROCTL_SH" herdr open 2>&1)" || rc=$?
    open_count="$(grep -c '^CALL: .*worktree open ' "$tmpdir/herdr.log" 2>/dev/null || true)"

    if [ "$rc" -eq 0 ] || [ "$open_count" -ne 0 ] \
      || ! printf '%s\n' "$output" | grep -qi 'worktree list.*could not be verified' \
      || printf '%s\n' "$output" | grep -q 'Start it in the foreground with:'; then
      _fail "required Herdr open fails closed when worktree list is $list_mode" \
        "rc=$rc; opens=$open_count; output=$output; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
      rm -rf "$tmpdir"
      return
    fi
    rm -rf "$tmpdir"
  done

  for schema_mode in TOP_LEVEL RESULT WORKTREES ENTRY PATH OPEN_WORKSPACE_ID; do
    tmpdir="$(_make_tmpdir)"
    _write_fixture "$tmpdir"
    repo="$tmpdir/repro"
    case "$schema_mode" in
      TOP_LEVEL) printf '[]\n' > "$tmpdir/state/workspaces.json" ;;
      RESULT) printf '{"result":[]}\n' > "$tmpdir/state/workspaces.json" ;;
      WORKTREES) printf '{"result":{"worktrees":{}}}\n' > "$tmpdir/state/workspaces.json" ;;
      ENTRY) printf '{"result":{"worktrees":[null]}}\n' > "$tmpdir/state/workspaces.json" ;;
      PATH) printf '{"result":{"worktrees":[{"path":42}]}}\n' > "$tmpdir/state/workspaces.json" ;;
      OPEN_WORKSPACE_ID)
        printf '{"result":{"worktrees":[{"path":"%s","open_workspace_id":42}]}}\n' \
          "$repo" > "$tmpdir/state/workspaces.json"
        ;;
    esac

    rc=0
    output="$(cd "$repo" && CALLER_PWD="$repo" HERDR_STUB_LOG="$tmpdir/herdr.log" \
      HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" PATH="$tmpdir/bin:$PATH" \
      bash "$REPROCTL_SH" herdr open 2>&1)" || rc=$?
    open_count="$(grep -c '^CALL: .*worktree open ' "$tmpdir/herdr.log" 2>/dev/null || true)"

    if [ "$rc" -eq 0 ] || [ "$open_count" -ne 0 ] \
      || ! printf '%s\n' "$output" | grep -qi 'worktree list.*could not be verified'; then
      _fail "required Herdr open fails closed for $schema_mode worktree-list schema" \
        "rc=$rc; opens=$open_count; output=$output; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
      rm -rf "$tmpdir"
      return
    fi
    rm -rf "$tmpdir"
  done

  _pass 'required Herdr open fails closed for failed, malformed, and invalid workspace-list responses'
}

test_missing_jq_has_dependency_recovery_without_probing_herdr() {
  local tmpdir repo output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"
  : > "$tmpdir/herdr.log"

  output="$(
    cd "$repo"
    command() {
      if [ "$#" -eq 2 ] && [ "$1" = '-v' ] && [ "$2" = 'jq' ]; then
        return 1
      fi
      builtin command "$@"
    }
    export -f command
    CALLER_PWD="$repo" HERDR_STUB_LOG="$tmpdir/herdr.log" \
      HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" \
      PATH="$tmpdir/bin:$PATH" bash "$REPROCTL_SH" herdr open 2>&1
  )" || rc=$?

  if [ "$rc" -ne 0 ] \
    && printf '%s\n' "$output" | grep -qi 'jq.*required' \
    && printf '%s\n' "$output" | grep -qF 'brew install jq' \
    && ! printf '%s\n' "$output" | grep -q 'Start it in the foreground with:' \
    && ! grep -q '^CALL:' "$tmpdir/herdr.log"; then
    _pass 'missing jq fails with dependency recovery before any Herdr command is issued'
  else
    _fail 'missing jq fails with dependency recovery before any Herdr command is issued' \
      "rc=$rc; output=$output; calls=$(cat "$tmpdir/herdr.log" 2>/dev/null || true)"
  fi
  rm -rf "$tmpdir"
}

test_direct_open_failure_is_nonzero() {
  local tmpdir repo output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_fixture "$tmpdir"
  repo="$tmpdir/repro"

  output="$(cd "$repo" && CALLER_PWD="$repo" HERDR_STUB_LOG="$tmpdir/herdr.log" \
    HERDR_STUB_REGISTRY="$tmpdir/state/workspaces.json" HERDR_STUB_OPEN_FAIL=1 \
    PATH="$tmpdir/bin:$PATH" bash "$REPROCTL_SH" herdr open 2>&1)" || rc=$?
  if [ "$rc" -ne 0 ] && printf '%s\n' "$output" | grep -q 'worktree open failed'; then
    _pass 'direct herdr open returns nonzero when the workspace cannot be opened'
  else
    _fail 'direct herdr open returns nonzero when the workspace cannot be opened' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_open_uses_project_config_and_current_checkout
test_open_reuses_workspace_and_uses_one_named_session
test_registered_but_closed_worktree_is_opened_once
test_reused_workspace_reports_nonempty_issue_title
test_open_from_worktree_targets_worktree_and_parent_checkout
test_missing_herdr_has_install_recovery
test_unavailable_daemon_has_session_scoped_recovery
test_status_failure_and_malformed_json_are_unavailable
test_required_open_fails_closed_when_workspace_list_is_unknown
test_missing_jq_has_dependency_recovery_without_probing_herdr
test_direct_open_failure_is_nonzero

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL)) tests"
[ "$FAIL" -eq 0 ]
