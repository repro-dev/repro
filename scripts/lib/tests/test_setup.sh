#!/bin/bash
# scripts/lib/tests/test_setup.sh
#
# Regression tests for bootstrap, doctor, and .envrc coverage.

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
  local tmpdir="$1" browser_state="$2" browser_install_state="$3" linear_mode="${4:-available}"
  local bindir="$tmpdir/bin"
  mkdir -p "$bindir"

  printf '#!/bin/bash\ncase "$1" in\n  bundle) exit 0 ;;\n  --version) echo "Homebrew 4.0.0" ;;\n  list) exit 0 ;;\n  *) echo "unexpected brew $*" >&2; exit 1 ;;\nesac\n' > "$bindir/brew"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/direnv"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/proto"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/docker"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/kind"
  printf '#!/bin/bash\nexit 0\n' > "$bindir/pandoc"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "portless 0.7.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/portless"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "v22.0.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/node"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "moon 1.0.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/moon"
  printf '#!/bin/bash\ncase "$1" in\n  version) echo "Tilt v0.33.0, built ..." ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/tilt"
  printf '#!/bin/bash\ncase "$1" in\n  version) echo "v1.3.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/helm"
  printf '#!/bin/bash\ncase "$1" in\n  version) echo "ctlptl v0.8.0" ;;\n  *) exit 0 ;;\nesac\n' > "$bindir/ctlptl"
  printf '#!/bin/bash\necho "unexpected npm $*" >&2\nexit 1\n' > "$bindir/npm"
  printf '#!/bin/bash\ncase "$1" in\n  install) exit 0 ;;\n  exec)\n    if [ "$2" = "linear" ] && [ "$3" = "--version" ]; then\n      if [ "%s" = "available" ]; then\n        echo "linear 1.0.0"\n        exit 0\n      fi\n      echo "linear missing" >&2\n      exit 1\n    fi\n    ;;\nesac\necho "unexpected pnpm $*" >&2\nexit 1\n' "$linear_mode" > "$bindir/pnpm"
  printf '#!/bin/bash\ncase "$1" in\n  --version) echo "agent-browser 1.2.3" ;;\n  doctor) if [ -f "%s" ]; then exit 0; else exit 1; fi ;;\n  install) : > "%s"; printf installed > "%s"; exit 0 ;;\n  *) echo "unexpected agent-browser $*" >&2; exit 1 ;;\nesac\n' "$browser_state" "$browser_state" "$browser_install_state" > "$bindir/agent-browser"
  chmod +x "$bindir"/*
}

_run_doctor() {
  local path="$1"
  bash -c "
    REPO_ROOT='$REPO_ROOT'
    MAIN_CHECKOUT='$REPO_ROOT'
    PARENT_DIR='$(dirname "$REPO_ROOT")'
    SCRIPTS_DIR='$REPO_ROOT/scripts'
    TMP_DIR='$REPO_ROOT/tmp'
    CONFIG_FILE='$REPO_ROOT/tmp/reproctl_services.json'
    INFRA_DIR='$REPO_ROOT/infra'
    PATH='$path'
    source '$COMMON_SH'
    source '$CLUSTER_SH'
    source '$SETUP_SH'
    cmd_doctor
  " 2>&1
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

test_bootstrap_uses_repo_local_linear_cli_from_pnpm_install() {
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

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "linear CLI available from workspace dependency"; then
    _pass "bootstrap uses repo-local linear CLI from pnpm install"
  else
    _fail "bootstrap uses repo-local linear CLI from pnpm install" "rc=$rc; output: $output"
  fi
}

test_bootstrap_fails_when_repo_local_linear_cli_is_missing() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state" missing

  local output
  output="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q "linear CLI was not available after pnpm install"; then
    _pass "bootstrap fails when repo-local linear CLI is missing"
  else
    _fail "bootstrap fails when repo-local linear CLI is missing" "rc=$rc; output: $output"
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

test_doctor_reports_healthy_agent_browser_runtime() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  mkdir -p "$tmpdir/node_modules/.bin"
  cat > "$tmpdir/node_modules/.bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/node_modules/.bin/linear"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(_run_doctor "$tmpdir/node_modules/.bin:$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
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
  mkdir -p "$tmpdir/node_modules/.bin"
  cat > "$tmpdir/node_modules/.bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/node_modules/.bin/linear"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(_run_doctor "$tmpdir/node_modules/.bin:$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
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
  mkdir -p "$tmpdir/node_modules/.bin"
  cat > "$tmpdir/node_modules/.bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/node_modules/.bin/linear"
  rm -f "$browser_state" "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state"

  local output
  output="$(_run_doctor "$tmpdir/node_modules/.bin:$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
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
  mkdir -p "$tmpdir/node_modules/.bin"
  cat > "$tmpdir/node_modules/.bin/linear" <<'EOF'
#!/bin/bash
case "$1" in
  --version) echo "linear 1.0.0" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$tmpdir/node_modules/.bin/linear"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/brew"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/direnv"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/proto"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/pnpm"
  printf '#!/bin/bash\nexit 0\n' > "$tmpdir/bin/docker"
  chmod +x "$tmpdir/bin"/*

  local output
  output="$(_run_doctor "$tmpdir/node_modules/.bin:$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
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
  output="$(_run_doctor "$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 1 ] && printf '%s\n' "$output" | grep -q "repo-local CLI missing" && printf '%s\n' "$output" | grep -q "linear"; then
    _pass "doctor reports missing linear CLI"
  else
    _fail "doctor reports missing linear CLI" "rc=$rc; output: $output"
  fi
}

test_envrc_adds_repo_local_workspace_bin_path() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/node_modules/.bin" "$tmpdir/bin" "$tmpdir/npm-global/bin"
  cat > "$tmpdir/bin/npm" <<EOF
#!/bin/bash
case "\$1 \$2" in
  "prefix -g") echo "$tmpdir/npm-global" ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$tmpdir/bin/npm"

  local output
  output="$(bash -c '
    set -euo pipefail
    PATH="'"$tmpdir/bin"'"
    PATH_add() {
      if [ "$1" = node_modules/.bin ]; then
        PATH="${PATH:+$PATH:}$PWD/$1"
      else
        PATH="${PATH:+$PATH:}$1"
      fi
    }
    source_env_if_exists() { :; }
    cd "'$tmpdir'"
    source "'"$REPO_ROOT"'/.envrc"
    printf "%s" "$PATH"
  ' 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s' "$output" | grep -q '/node_modules/.bin' && ! printf '%s' "$output" | grep -q '/npm-global/bin'; then
    _pass ".envrc exposes the repo-local pnpm bin path"
  else
    _fail ".envrc exposes the repo-local pnpm bin path" "rc=$rc; output: $output"
  fi
}

test_bootstrap_installs_browser_runtime_when_health_check_fails
test_bootstrap_uses_repo_local_linear_cli_from_pnpm_install
test_bootstrap_fails_when_repo_local_linear_cli_is_missing
test_bootstrap_skips_install_when_runtime_is_healthy
test_doctor_reports_healthy_agent_browser_runtime
test_doctor_reports_healthy_linear_cli
test_doctor_reports_broken_agent_browser_runtime_with_recovery_guidance
test_doctor_reports_missing_agent_browser_binary
test_doctor_reports_missing_linear_cli
test_envrc_adds_repo_local_workspace_bin_path

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
