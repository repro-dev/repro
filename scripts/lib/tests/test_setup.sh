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
  local tmpdir="$1" browser_state="$2" browser_install_state="$3" linear_mode="${4:-available}" sdk_mode="${5:-available}" auth_vault_state="${6:-$2}"
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
  printf '#!/bin/bash\ncase "$1" in\n  install) exit 0 ;;\n  exec)\n    if [ "$2" = "linear" ] && [ "$3" = "--version" ]; then\n      if [ "%s" = "available" ]; then\n        echo "linear 1.0.0"\n        exit 0\n      fi\n      echo "linear missing" >&2\n      exit 1\n    fi\n    if [ "$2" = "node" ] && [ "$3" = "--input-type=module" ] && [ "$4" = "-e" ]; then\n      if [ "%s" = "available" ]; then\n        exit 0\n      fi\n      echo "Cannot find module @linear/sdk" >&2\n      exit 1\n    fi\n    ;;\nesac\necho "unexpected pnpm $*" >&2\nexit 1\n' "$linear_mode" "$sdk_mode" > "$bindir/pnpm"
  cat > "$bindir/agent-browser" <<EOF
#!/bin/bash
case "\$1" in
  --version) echo "agent-browser 1.2.3" ;;
  doctor) if [ -f "$browser_state" ]; then exit 0; else exit 1; fi ;;
  install) : > "$browser_state"; printf installed > "$browser_install_state"; exit 0 ;;
  auth)
    case "\$2" in
      save)
        name="\$3"
        url=""
        username=""
        password=""
        shift 3
        while [ \$# -gt 0 ]; do
          case "\$1" in
            --url) url="\$2"; shift 2 ;;
            --username) username="\$2"; shift 2 ;;
            --password) password="\$2"; shift 2 ;;
            *) shift ;;
          esac
        done
        tmp_state="$auth_vault_state.tmp"
        grep -v "^\$name|" "$auth_vault_state" > "\$tmp_state" 2>/dev/null || : > "\$tmp_state"
        printf '%s|%s|%s|%s\n' "\$name" "\$url" "\$username" "\$password" >> "\$tmp_state"
        mv "\$tmp_state" "$auth_vault_state"
        exit 0
        ;;
      list)
        cat "$auth_vault_state"
        exit 0
        ;;
    esac
    ;;
  *) echo "unexpected agent-browser \$*" >&2; exit 1 ;;
esac
EOF
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

test_bootstrap_seeds_agent_browser_auth_vault_profiles_and_is_idempotent() {
  local tmpdir rc1=0 rc2=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  local auth_vault_state="$tmpdir/auth-vault"
  : > "$browser_state"
  rm -f "$browser_install_state" "$auth_vault_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state" available available "$auth_vault_state"

  local output1 output2 expected_workspace_url expected_admin_url
  output1="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc1=$?
  output2="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc2=$?
  expected_workspace_url="$(python3 "$REPO_ROOT/scripts/lib/py/local_service_url.py" workspace "$REPO_ROOT/infra/services.json")"
  expected_admin_url="$(python3 "$REPO_ROOT/scripts/lib/py/local_service_url.py" admin "$REPO_ROOT/infra/services.json")"

  local expected_profiles=(
    "acme-admin|$expected_workspace_url|admin@acme.repro.test|password"
    "acme-member|$expected_workspace_url|member@acme.repro.test|password"
    "acme-viewer|$expected_workspace_url|viewer@acme.repro.test|password"
    "beta-admin|$expected_workspace_url|admin@beta.repro.test|password"
    "beta-unverified|$expected_workspace_url|unverified@beta.repro.test|password"
    "staff|$expected_admin_url|staff@repro.test|password"
    "staff-admin|$expected_admin_url|staffadmin@repro.test|password"
  )

  local expected_profile count
  for expected_profile in "${expected_profiles[@]}"; do
    if ! grep -Fxq "$expected_profile" "$auth_vault_state"; then
      rm -rf "$tmpdir"
      _fail "bootstrap seeds agent-browser auth vault profiles and is idempotent" "missing profile: $expected_profile; first run rc=$rc1; second run rc=$rc2; output1: $output1; output2: $output2"
      return
    fi
  done

  for expected_profile in acme-admin acme-member acme-viewer beta-admin beta-unverified staff staff-admin; do
    count="$(grep -c "^$expected_profile|" "$auth_vault_state" 2>/dev/null || true)"
    if [ "$count" -ne 1 ]; then
      rm -rf "$tmpdir"
      _fail "bootstrap seeds agent-browser auth vault profiles and is idempotent" "expected exactly one entry for $expected_profile, found $count; first run rc=$rc1; second run rc=$rc2; output1: $output1; output2: $output2"
      return
    fi
  done

  if [ $rc1 -eq 0 ] && [ $rc2 -eq 0 ] && [ "$(wc -l < "$auth_vault_state")" -eq 7 ]; then
    rm -rf "$tmpdir"
    _pass "bootstrap seeds agent-browser auth vault profiles and is idempotent"
  else
    rm -rf "$tmpdir"
    _fail "bootstrap seeds agent-browser auth vault profiles and is idempotent" "first run rc=$rc1; second run rc=$rc2; output1: $output1; output2: $output2; vault: $(cat "$auth_vault_state" 2>/dev/null || true)"
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

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "linear CLI wrapper and @linear/sdk are available from workspace dependency"; then
    _pass "bootstrap uses repo-local linear CLI from pnpm install"
  else
    _fail "bootstrap uses repo-local linear CLI from pnpm install" "rc=$rc; output: $output"
  fi
}

test_bootstrap_fails_when_linear_wrapper_execution_fails_but_sdk_resolution_succeeds() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state" missing available

  local output
  output="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q "repo-local Linear CLI wrapper could not execute or resolve @linear/sdk after pnpm install"; then
    _pass "bootstrap fails when linear wrapper execution fails but SDK resolution succeeds"
  else
    _fail "bootstrap fails when linear wrapper execution fails but SDK resolution succeeds" "rc=$rc; output: $output"
  fi
}

test_bootstrap_fails_when_linear_version_succeeds_but_sdk_resolution_fails() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state" available missing

  local output
  output="$(PATH="$tmpdir/bin:$SYSTEM_PATH" bash "$BOOTSTRAP_SH" --no-cluster 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q "repo-local Linear CLI wrapper could not execute or resolve @linear/sdk after pnpm install"; then
    _pass "bootstrap fails when linear version succeeds but SDK resolution fails"
  else
    _fail "bootstrap fails when linear version succeeds but SDK resolution fails" "rc=$rc; output: $output"
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

test_doctor_reports_healthy_linear_sdk_dependency_resolution() {
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

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -Eq '^[[:space:]]*ok[[:space:]]+linear[[:space:]]+.*wrapper.*@linear/sdk'; then
    _pass "doctor reports healthy linear SDK dependency resolution"
  else
    _fail "doctor reports healthy linear SDK dependency resolution" "rc=$rc; output: $output"
  fi
}

test_doctor_reports_missing_linear_wrapper_even_if_sdk_dependency_resolves() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state" missing available

  local output
  output="$(_run_doctor "$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 1 ] && printf '%s\n' "$output" | grep -q "repo-local CLI wrapper cannot execute or resolve @linear/sdk"; then
    _pass "doctor reports missing linear wrapper even if SDK dependency resolves"
  else
    _fail "doctor reports missing linear wrapper even if SDK dependency resolves" "rc=$rc; output: $output"
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

test_doctor_reports_missing_linear_sdk_dependency() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  local browser_state="$tmpdir/browser-ok"
  local browser_install_state="$tmpdir/browser-installed"
  : > "$browser_state"
  rm -f "$browser_install_state"
  _write_bootstrap_stubs "$tmpdir" "$browser_state" "$browser_install_state" available missing

  local output
  output="$(_run_doctor "$tmpdir/bin:$SYSTEM_PATH")" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 1 ] && printf '%s\n' "$output" | grep -q "@linear/sdk" && printf '%s\n' "$output" | grep -q "repo-local CLI wrapper cannot execute or resolve"; then
    _pass "doctor reports missing linear SDK dependency"
  else
    _fail "doctor reports missing linear SDK dependency" "rc=$rc; output: $output"
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
test_bootstrap_seeds_agent_browser_auth_vault_profiles_and_is_idempotent
test_bootstrap_uses_repo_local_linear_cli_from_pnpm_install
test_bootstrap_fails_when_linear_wrapper_execution_fails_but_sdk_resolution_succeeds
test_bootstrap_fails_when_linear_version_succeeds_but_sdk_resolution_fails
test_bootstrap_skips_install_when_runtime_is_healthy
test_doctor_reports_healthy_agent_browser_runtime
test_doctor_reports_healthy_linear_sdk_dependency_resolution
test_doctor_reports_missing_linear_wrapper_even_if_sdk_dependency_resolves
test_doctor_reports_broken_agent_browser_runtime_with_recovery_guidance
test_doctor_reports_missing_agent_browser_binary
test_doctor_reports_missing_linear_sdk_dependency
test_envrc_adds_repo_local_workspace_bin_path

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
