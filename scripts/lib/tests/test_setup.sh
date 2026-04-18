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
SYSTEM_PATH='/usr/bin:/bin:/usr/sbin:/sbin'

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_setup
}

_write_bootstrap_stubs() {
  local tmpdir="$1" browser_state="$2" browser_install_state="$3"
  local bindir="$tmpdir/bin"
  local npm_prefix="$tmpdir/npm-global"
  mkdir -p "$bindir"
  mkdir -p "$npm_prefix/bin"

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
  cat > "$bindir/npm" <<'EOF'
#!/bin/bash
case "$1 $2" in
  "prefix -g")
    echo "__NPM_PREFIX__"
    ;;
  "install -g")
    if [ "$3" = "@dabble/linear-cli" ]; then
      cat > "__NPM_PREFIX__/linear" <<'LINEAR'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
LINEAR
      chmod +x "__NPM_PREFIX__/linear"
      exit 0
    fi
    ;;
esac
exit 0
EOF
  python3 - <<PY
from pathlib import Path
path = Path("$bindir/npm")
text = path.read_text()
text = text.replace("__NPM_PREFIX__", "$npm_prefix/bin")
path.write_text(text)
PY
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "agent-browser 1.2.3" ;;\n  doctor) if [ -f "%s" ]; then exit 0; else exit 1; fi ;;\n  install) : > "%s"; printf installed > "%s"; exit 0 ;;\n  *) echo "unexpected agent-browser $*" >&2; exit 1 ;;\nesac\n' "$browser_state" "$browser_state" "$browser_install_state" > "$bindir/agent-browser"
  chmod +x "$bindir"/*
}

test_bootstrap_installs_browser_runtime_when_health_check_fails() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  rm -f "$browser_state" "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "agent-browser runtime provisioned"; then
    _pass "bootstrap provisions agent-browser when doctor fails"
  else
    _fail "bootstrap provisions agent-browser when doctor fails" "rc=$rc; output: $output"
  fi
}

test_bootstrap_installs_linear_cli_globally_when_missing() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  rm -f "$browser_state" "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "linear CLI installed globally"; then
    _pass "bootstrap installs linear CLI globally when missing"
  else
    _fail "bootstrap installs linear CLI globally when missing" "rc=$rc; output: $output"
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
  output="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "agent-browser runtime healthy"; then
    _pass "bootstrap skips agent-browser install when runtime is healthy"
  else
    _fail "bootstrap skips agent-browser install when runtime is healthy" "rc=$rc; output: $output"
  fi
}

test_bootstrap_skips_linear_install_when_cli_is_present() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  mkdir -p "$tmpdir/npm-global/bin"
  cat > "$tmpdir/npm-global/bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/npm-global/bin/linear"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(PATH="$tmpdir/npm-global/bin:$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "linear CLI already installed"; then
    _pass "bootstrap skips linear install when CLI is present"
  else
    _fail "bootstrap skips linear install when CLI is present" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_healthy_agent_browser_runtime() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  mkdir -p "$tmpdir/npm-global/bin"
  cat > "$tmpdir/npm-global/bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/npm-global/bin/linear"
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
    PATH='$tmpdir/npm-global/bin:$tmpdir/bin:$SYSTEM_PATH'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -Eq '^[[:space:]]*ok[[:space:]]+agent-browser runtime[[:space:]]+.*healthy'; then
    _pass "doctor reports healthy agent-browser runtime"
  else
    _fail "doctor reports healthy agent-browser runtime" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_healthy_linear_cli() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  mkdir -p "$tmpdir/npm-global/bin"
  cat > "$tmpdir/npm-global/bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/npm-global/bin/linear"
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
    PATH='$tmpdir/npm-global/bin:$tmpdir/bin:$SYSTEM_PATH'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -Eq '^[[:space:]]*ok[[:space:]]+linear[[:space:]]+.*v1\.0\.0'; then
    _pass "doctor reports healthy linear CLI"
  else
    _fail "doctor reports healthy linear CLI" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_broken_agent_browser_runtime_with_recovery_guidance() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  mkdir -p "$tmpdir/npm-global/bin"
  cat > "$tmpdir/npm-global/bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/npm-global/bin/linear"
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
    PATH='$tmpdir/npm-global/bin:$tmpdir/bin:$SYSTEM_PATH'
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
  mkdir -p "$tmpdir/npm-global/bin"
  cat > "$tmpdir/npm-global/bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/npm-global/bin/linear"
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
    PATH='$tmpdir/npm-global/bin:$tmpdir/bin:$SYSTEM_PATH'
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

test_doctor_reports_missing_linear_cli() {
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
    PATH='$tmpdir/bin:$SYSTEM_PATH'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 1 ] && printf '%s\n' "$output" | grep -q "not installed — run 'reproctl setup'" && printf '%s\n' "$output" | grep -q "linear"; then
    _pass "doctor reports missing linear CLI"
  else
    _fail "doctor reports missing linear CLI" "rc=$rc; output: $output"
  fi
}

test_bootstrap_installs_browser_runtime_when_health_check_fails
test_bootstrap_installs_linear_cli_globally_when_missing
test_bootstrap_skips_install_when_runtime_is_healthy
test_bootstrap_skips_linear_install_when_cli_is_present
test_doctor_reports_healthy_agent_browser_runtime
test_doctor_reports_healthy_linear_cli
test_doctor_reports_broken_agent_browser_runtime_with_recovery_guidance
test_doctor_reports_missing_agent_browser_binary
test_doctor_reports_missing_linear_cli

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
