#!/bin/bash
# scripts/lib/tests/test_setup.sh
#
# Regression tests for agent-browser bootstrap and doctor coverage.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"
BOOTSTRAP_SH="$REPO_ROOT/scripts/bootstrap.sh"
COMMON_SH="$REPO_ROOT/scripts/lib/common.sh"
SETUP_SH="$REPO_ROOT/scripts/lib/setup.sh"
CLUSTER_SH="$REPO_ROOT/scripts/lib/cluster.sh"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_setup
}

_write_bootstrap_stubs() {
  local tmpdir="$1" browser_state="$2" browser_install_state="$3"
  local bindir="$tmpdir/bin"
  mkdir -p "$bindir"

  printf '#!/bin/bash\ncase "$1" in\n  bundle) exit 0 ;;\n  --version) echo "Homebrew 4.0.0" ;;\n  list) exit 0 ;;\n  *) echo "unexpected brew $*" >&2; exit 1 ;;\nesac\n' > "$bindir/brew"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/direnv"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/proto"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/pnpm"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/docker"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/kind"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/pandoc"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "portless 0.7.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/portless"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "v22.0.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/node"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "moon 1.0.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/moon"
  printf '#!/bin/bash\ncase "$1" in\n  version) echo "Tilt v0.33.0, built ..." ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/tilt"
  printf '#!/bin/bash\ncase "$1" in\n  version) echo "v1.3.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/helm"
  printf '#!/bin/bash\ncase "$1" in\n  version) echo "ctlptl v0.8.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/ctlptl"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "agent-browser 1.2.3" ;;\n  doctor) if [ -f "%s" ]; then exit 0; else exit 1; fi ;;\n  install) : > "%s"; printf installed > "%s"; exit 0 ;;\n  *) echo "unexpected agent-browser $*" >&2; exit 1 ;;\nesac\n' "$browser_state" "$browser_state" "$browser_install_state" > "$bindir/agent-browser"
  chmod +x "$bindir"/*
}

_source_setup_lib() {
  export REPO_ROOT MAIN_CHECKOUT PARENT_DIR SCRIPTS_DIR TMP_DIR CONFIG_FILE INFRA_DIR
  # shellcheck source=/dev/null
  source "$COMMON_SH"
  # shellcheck source=/dev/null
  source "$CLUSTER_SH"
  # shellcheck source=/dev/null
  source "$SETUP_SH"
}

test_bootstrap_installs_browser_runtime_when_health_check_fails() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  rm -f "$browser_state" "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(PATH="$tmpdir/bin:$PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "agent-browser runtime provisioned"; then
    _pass "bootstrap provisions agent-browser when doctor fails"
  else
    _fail "bootstrap provisions agent-browser when doctor fails" "rc=$rc; output: $output"
  fi
}

test_bootstrap_skips_install_when_runtime_is_healthy() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(PATH="$tmpdir/bin:$PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "agent-browser runtime healthy"; then
    _pass "bootstrap skips agent-browser install when runtime is healthy"
  else
    _fail "bootstrap skips agent-browser install when runtime is healthy" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_healthy_agent_browser_runtime() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(bash -c "
    REPO_ROOT='$REPO_ROOT'
    MAIN_CHECKOUT='$REPO_ROOT'
    PARENT_DIR='$(dirname "$REPO_ROOT")'
    SCRIPTS_DIR='$REPO_ROOT/scripts'
    TMP_DIR='$REPO_ROOT/tmp'
    CONFIG_FILE='$REPO_ROOT/tmp/reproctl_services.json'
    INFRA_DIR='$REPO_ROOT/infra'
    PATH='$tmpdir/bin:$PATH'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "agent-browser runtime" && printf '%s\n' "$output" | grep -q "ok"; then
    _pass "doctor reports healthy agent-browser runtime"
  else
    _fail "doctor reports healthy agent-browser runtime" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_broken_agent_browser_runtime_with_recovery_guidance() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  rm -f "$browser_state" "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(bash -c "
    REPO_ROOT='$REPO_ROOT'
    MAIN_CHECKOUT='$REPO_ROOT'
    PARENT_DIR='$(dirname "$REPO_ROOT")'
    SCRIPTS_DIR='$REPO_ROOT/scripts'
    TMP_DIR='$REPO_ROOT/tmp'
    CONFIG_FILE='$REPO_ROOT/tmp/reproctl_services.json'
    INFRA_DIR='$REPO_ROOT/infra'
    PATH='$tmpdir/bin:$PATH'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 1 ] && printf '%s\n' "$output" | grep -q "agent-browser doctor --fix" && printf '%s\n' "$output" | grep -q "runtime unhealthy"; then
    _pass "doctor reports broken agent-browser runtime with recovery guidance"
  else
    _fail "doctor reports broken agent-browser runtime with recovery guidance" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_missing_agent_browser_binary() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/bin"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/brew"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/direnv"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/proto"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/pnpm"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/docker"
  chmod +x "$tmpdir/bin"/*

  local output
  output="$(bash -c "
    REPO_ROOT='$REPO_ROOT'
    MAIN_CHECKOUT='$REPO_ROOT'
    PARENT_DIR='$(dirname "$REPO_ROOT")'
    SCRIPTS_DIR='$REPO_ROOT/scripts'
    TMP_DIR='$REPO_ROOT/tmp'
    CONFIG_FILE='$REPO_ROOT/tmp/reproctl_services.json'
    INFRA_DIR='$REPO_ROOT/infra'
    PATH='$tmpdir/bin:$PATH'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 1 ] && printf '%s\n' "$output" | grep -q "not installed — run 'reproctl setup'"; then
    _pass "doctor reports missing agent-browser binary"
  else
    _fail "doctor reports missing agent-browser binary" "rc=$rc; output: $output"
  fi
}

test_bootstrap_installs_browser_runtime_when_health_check_fails
test_bootstrap_skips_install_when_runtime_is_healthy
test_doctor_reports_healthy_agent_browser_runtime
test_doctor_reports_broken_agent_browser_runtime_with_recovery_guidance
test_doctor_reports_missing_agent_browser_binary

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
