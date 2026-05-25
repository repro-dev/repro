#!/bin/bash
# scripts/lib/tests/test_worktree_prune_protection.sh
#
# Regression coverage for conservative wt prune protections (REP-1302).

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

run_git_test() {
  local desc="$1" snippet="$2"
  local output rc=0
  output="$(bash -c "$snippet" 2>&1)" || rc=$?
  local first_line
  first_line="$(printf '%s\n' "$output" | sed -n '1p')"
  if [[ "$first_line" == "PASS" ]]; then
    _pass "$desc"
  else
    _fail "$desc" "rc=$rc output=$output"
  fi
}

COMMON_SETUP='
_TDIR="$(mktemp -d)"
_TDIR="$(cd "$_TDIR" && pwd -P)"

_origin="$_TDIR/origin.git"
git init --bare "$_origin" >/dev/null 2>&1

_main="$_TDIR/repro"
mkdir -p "$_main"
git -C "$_main" init -b main >/dev/null 2>&1
git -C "$_main" config user.email "test@test.com"
git -C "$_main" config user.name "Test"
git -C "$_main" commit --allow-empty -m "init" >/dev/null 2>&1
git -C "$_main" remote add origin "$_origin"
git -C "$_main" push -u origin main >/dev/null 2>&1

_add_worktree() {
  local slug="$1"
  local branch="$2"
  local wt="$_TDIR/repro-wt-${slug}"
  git -C "$_main" worktree add -b "$branch" "$wt" main >/dev/null 2>&1
  echo "$wt"
}

_install_fake_linear() {
  local status_type="$1"
  mkdir -p "$_TDIR/bin"
  cat >"$_TDIR/bin/linear" <<EOF
#!/bin/bash
if [ "\$1" = "issue" ] && [ "\$2" = "show" ]; then
  printf '\''{"item":{"status":{"type":"%s"}}}\n'\'' "$status_type"
  exit 0
fi
exit 1
EOF
  chmod +x "$_TDIR/bin/linear"
  export PATH="$_TDIR/bin:$PATH"
}

_src_wt() {
  cd "$_main"
  export REPO_ROOT="$_main"
  export MAIN_CHECKOUT="$_main"
  export PARENT_DIR="$(dirname "$_main")"
  export CONFIG_FILE="$_main/tmp/reproctl_services.json"
  export SCRIPTS_DIR="$(cd "'"$TESTS_DIR"'/../.." && pwd -P)"
  export TMP_DIR="$_main/tmp"
  mkdir -p "$_main/tmp"
  CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""
  export CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
  die()           { printf "Error: %b\n" "$*" >&2; return 1; }
  _step()         { :; }
  _ok()           { :; }
  _err()          { printf "x %s\n" "$1" >&2; }
  _warn()         { :; }
  slugify()       { printf "%s\n" "$1" | sed "s|/|-|g" | tr "[:upper:]" "[:lower:]"; }
  worktree_path() { echo "$PARENT_DIR/repro-wt-$1"; }
  # shellcheck source=../worktree.sh
  source '"$WORKTREE_SH"'
}

_cleanup() { rm -rf "$_TDIR"; }
trap _cleanup EXIT
'

printf '\nworktree.sh — wt prune protections (REP-1302)\n\n'

run_git_test "cmd_wt_prune preserves in-progress issue worktree" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree rep-1302-active gary/rep-1302-active)\"
_install_fake_linear started
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_prune 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && -d \"\$wt_dir\" && \"\$output\" == *'Worktrees protected from pruning'* ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no) output=\$output\"
fi
"

run_git_test "cmd_wt_prune preserves worktree with orchestration artifact" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree artifact nonissue/artifact)\"
mkdir -p \"\$wt_dir/tmp\"
printf 'context\n' >\"\$wt_dir/tmp/context-REP-1302.md\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_prune 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && -d \"\$wt_dir\" && \"\$output\" == *'orchestration artifacts'* ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no) output=\$output\"
fi
"

run_git_test "cmd_wt_prune preserves worktree with active service record" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree active-service nonissue/active-service)\"
mkdir -p \"\$_main/tmp\"
printf '{\"services\":[{\"name\":\"api-server\",\"slug\":\"active-service\"}]}\n' >\"\$_main/tmp/reproctl_services.json\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_prune 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && -d \"\$wt_dir\" && \"\$output\" == *'active services'* ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no) output=\$output\"
fi
"

run_git_test "cmd_wt_prune removes stale merged worktree without protections" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree stale nonissue/stale)\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_prune 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && ! -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no) output=\$output\"
fi
"

run_git_test "cmd_wt_prune removes terminal issue worktree without other protections" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree rep-1302-done gary/rep-1302-done)\"
_install_fake_linear completed
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_prune 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && ! -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no) output=\$output\"
fi
"

printf '\n%d/%d tests passed\n' "$PASS" "$TESTS_RUN"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
