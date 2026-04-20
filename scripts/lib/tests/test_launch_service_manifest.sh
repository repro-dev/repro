#!/bin/bash
# scripts/lib/tests/test_launch_service_manifest.sh
#
# Regression tests for REP-745: start/launch help and launchable service
# discovery must be driven by infra/services.json.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"
REPROCTL_SH="$REPO_ROOT/scripts/reproctl.sh"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

assert_contains() {
  local haystack="$1" needle="$2"
  [[ "$haystack" == *"$needle"* ]]
}

assert_not_contains() {
  local haystack="$1" needle="$2"
  [[ "$haystack" != *"$needle"* ]]
}

run_test() {
  local desc="$1" snippet="$2"
  local output rc=0
  export -f assert_contains assert_not_contains
  output="$(bash -c "$snippet" 2>&1)" || rc=$?
  local first_line
  first_line="$(printf '%s\n' "$output" | sed -n '1p')"
  if [[ "$first_line" == "PASS" ]]; then
    _pass "$desc"
  else
    _fail "$desc" "$output"
  fi
}

run_test "start --help lists manifest services including start-only entries" '
output="$(CALLER_PWD="'$REPO_ROOT'" bash "'$REPROCTL_SH'" start --help 2>&1)"
assert_contains "$output" "Services:" || { echo "FAIL: missing Services section"; exit 1; }
assert_contains "$output" "marketing" || { echo "FAIL: missing marketing"; exit 1; }
assert_contains "$output" "dev-toolbar" || { echo "FAIL: missing dev-toolbar"; exit 1; }
assert_contains "$output" "--full-stack" || { echo "FAIL: missing full-stack flag"; exit 1; }
echo PASS
'

run_test "start --full-stack starts worktree-local manifest deps alongside the request" '
test_tmp="'$REPO_ROOT'/tmp/test-start-full-stack-$$"
rm -rf "$test_tmp"
mkdir -p "$test_tmp/infra"
trap "rm -rf \"$test_tmp\"" EXIT

cat > "$test_tmp/services.json" <<JSON
{
  "workspace": {
    "type": "local",
    "moon_project": "repro/workspace",
    "app_dir": "apps/workspace",
    "serve_cmd": "moon run repro/workspace:dev",
    "deps": ["api-server"]
  },
  "api-server": {
    "type": "local",
    "moon_project": "repro/api-server",
    "app_dir": "apps/api-server",
    "serve_cmd": "moon run repro/api-server:dev",
    "deps": []
  }
}
JSON

source "'$REPO_ROOT'/scripts/lib/common.sh"
source "'$REPO_ROOT'/scripts/lib/services.sh"

TMP_DIR="$test_tmp"
CONFIG_FILE="$test_tmp/reproctl_services.json"
SERVICES_JSON="$test_tmp/services.json"
INFRA_DIR="$test_tmp/infra"
EXPECTED_SOURCE="'$REPO_ROOT'"
export EXPECTED_SOURCE

cluster_preflight() { return 0; }
tilt_is_running() { return 0; }
is_worktree() { return 0; }
detect_worktree_slug() { echo "rep-875"; }
_step() { :; }
_ok() { :; }
_warn() { :; }
print_services() { :; }

cmd_start --full-stack workspace >/dev/null 2>&1 || { echo "FAIL: start command failed"; exit 1; }

python3 - "$CONFIG_FILE" <<'PY'
import json
import os
import sys

expected_source = os.environ["EXPECTED_SOURCE"]
with open(sys.argv[1], encoding="utf-8") as file:
    data = json.load(file)

entries = {(item["name"], item["slug"], item["source"]) for item in data["services"]}
expected = {
    ("workspace", "rep-875", expected_source),
    ("api-server", "rep-875", expected_source),
}

if entries != expected:
    print(f"FAIL: entries={sorted(entries)!r}")
    sys.exit(1)
PY

echo PASS
'

run_test "launch --help lists only launchable manifest services" '
output="$(CALLER_PWD="'$REPO_ROOT'" bash "'$REPROCTL_SH'" launch --help 2>&1)"
assert_contains "$output" "marketing" || { echo "FAIL: missing marketing"; exit 1; }
assert_contains "$output" "storybook-ui" || { echo "FAIL: missing storybook-ui"; exit 1; }
assert_contains "$output" "capture" || { echo "FAIL: missing capture"; exit 1; }
assert_not_contains "$output" "dev-toolbar" || { echo "FAIL: dev-toolbar should not be launchable"; exit 1; }
echo PASS
'

run_test "launch runtime uses manifest launch.kind for capture behavior" '
test_tmp="'$REPO_ROOT'/tmp/test-launch-kind-$$"
rm -rf "$test_tmp"
mkdir -p "$test_tmp/home"
trap "rm -rf \"$test_tmp\"" EXIT

cat > "$test_tmp/services.json" <<JSON
{
  "browser-ext": {
    "type": "local",
    "description": "Browser extension",
    "launch": { "kind": "capture", "description": "Chrome extension" }
  },
  "workspace": {
    "type": "local",
    "description": "Workspace",
    "portless_name": "app.repro",
    "launch": { "kind": "url", "description": "App frontend" }
  }
}
JSON

export HOME="$test_tmp/home"
export REPO_ROOT="'$REPO_ROOT'"
export SCRIPTS_DIR="'$REPO_ROOT'/scripts"
export SERVICES_JSON="$test_tmp/services.json"
export CONFIG_FILE="$test_tmp/reproctl_services.json"

source "'$REPO_ROOT'/scripts/lib/launch.sh"

die() { printf "%b\n" "$*" >&2; exit 1; }
_warn() { :; }
_ok() { printf "%s\n" "$*"; }
_launchable_services() { printf "browser-ext\nworkspace\n"; }
is_worktree() { return 1; }
detect_worktree_slug() { return 1; }
resolve_worktree() { return 1; }
worktree_path() { printf "%s\n" "$REPO_ROOT"; }
cmd_start() { printf "FAIL: cmd_start should not be called\n"; exit 1; }
_ensure_playwright_chromium() { printf "/bin/true\n"; }

output="$(cmd_launch browser-ext 2>&1)" || { echo "FAIL: $output"; exit 1; }
assert_contains "$output" "Launching Chromium with capture extension" || { echo "FAIL: missing capture launch output"; exit 1; }
assert_not_contains "$output" "Unknown service: browser-ext" || { echo "FAIL: runtime still treated capture launch as unknown service"; exit 1; }
echo PASS
'

run_test "unknown launch service error shows manifest-driven launchable list" '
set +e
output="$(CALLER_PWD="'$REPO_ROOT'" bash "'$REPROCTL_SH'" launch dev-toolbar 2>&1)"
rc=$?
set -e
[[ "$rc" -eq 1 ]] || { echo "FAIL: expected exit 1, got $rc"; exit 1; }
available_line=""
while IFS= read -r line; do
  case "$line" in
    *"Available services:"*)
      available_line="$line"
      ;;
  esac
done <<< "$output"
assert_contains "$available_line" "Available services:" || { echo "FAIL: missing available services message"; exit 1; }
assert_contains "$available_line" "marketing" || { echo "FAIL: missing marketing from available services"; exit 1; }
assert_contains "$available_line" "storybook-ui" || { echo "FAIL: missing storybook-ui from available services"; exit 1; }
assert_not_contains "$available_line" "dev-toolbar" || { echo "FAIL: dev-toolbar should not be listed as launchable"; exit 1; }
echo PASS
'

run_test "completion scripts share manifest-driven service helpers" '
bash_completion="$(CALLER_PWD="'$REPO_ROOT'" bash "'$REPROCTL_SH'" completion bash)"
fish_completion="$(CALLER_PWD="'$REPO_ROOT'" bash "'$REPROCTL_SH'" completion fish)"
zsh_completion="$(CALLER_PWD="'$REPO_ROOT'" bash "'$REPROCTL_SH'" completion zsh)"
assert_contains "$bash_completion" "service_names.py" || { echo "FAIL: bash completion missing service_names helper"; exit 1; }
assert_contains "$fish_completion" "service_names.py" || { echo "FAIL: fish completion missing service_names helper"; exit 1; }
assert_contains "$zsh_completion" "service_names.py" || { echo "FAIL: zsh completion missing service_names helper"; exit 1; }
assert_not_contains "$bash_completion" "echo \"workspace\"" || { echo "FAIL: bash completion still hardcodes launch services"; exit 1; }
assert_not_contains "$fish_completion" "echo workspace" || { echo "FAIL: fish completion still hardcodes launch services"; exit 1; }
assert_not_contains "$zsh_completion" "echo \"workspace\"" || { echo "FAIL: zsh completion still hardcodes launch services"; exit 1; }
echo PASS
'

printf '\nlaunch/start manifest help (REP-745)\n\n'
printf '\n%d/%d tests passed\n' "$PASS" "$TESTS_RUN"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
