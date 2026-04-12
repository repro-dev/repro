#!/bin/bash
# scripts/lib/tests/test_worktree_create_from_issue.sh
#
# Regression tests for issue-based worktree creation.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"
SCRIPTS_DIR_REAL="$(cd "$TESTS_DIR/../.." && pwd -P)"

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
  first_line="$(printf '%s\n' "$output" | head -1)"
  if [[ "$first_line" == "PASS" ]]; then
    _pass "$desc"
  else
    _fail "$desc" "$output"
  fi
}

COMMON_SETUP='
_TDIR="$(mktemp -d)"
_TDIR="$(cd "$_TDIR" && pwd -P)"

_origin="$_TDIR/origin.git"
git init --bare "$_origin" >/dev/null 2>&1

_main="$_TDIR/repro"
git clone "$_origin" "$_main" >/dev/null 2>&1
git -C "$_main" config user.email "test@test.com"
git -C "$_main" config user.name "Test"
git -C "$_main" switch -c main >/dev/null 2>&1

printf "init\n" > "$_main/README.md"
git -C "$_main" add README.md
git -C "$_main" commit -m "init" >/dev/null 2>&1
git -C "$_main" push -u origin main >/dev/null 2>&1

issue_branch="gary/rep-812-manage-jcodemunch-python-dependencies-in-bootstrap-setup"
git -C "$_main" branch "$issue_branch"
git -C "$_main" push origin "$issue_branch" >/dev/null 2>&1

printf "latest main\n" > "$_main/latest-from-main.txt"
git -C "$_main" add latest-from-main.txt
git -C "$_main" commit -m "advance main" >/dev/null 2>&1
git -C "$_main" push origin main >/dev/null 2>&1

_FAKE_BIN="$_TDIR/fake-bin"
mkdir -p "$_FAKE_BIN"
printf "#!/bin/bash\nexit 0\n" > "$_FAKE_BIN/pnpm"
printf "#!/bin/bash\nexit 0\n" > "$_FAKE_BIN/moon"
chmod +x "$_FAKE_BIN/pnpm" "$_FAKE_BIN/moon"
export PATH="$_FAKE_BIN:$PATH"

_src_wt() {
  cd "$_main"
  export REPO_ROOT="$_main"
  export MAIN_CHECKOUT="$_main"
  export PARENT_DIR="$(dirname "$_main")"
  export CONFIG_FILE="$_main/tmp/reproctl_services.json"
  export SCRIPTS_DIR="'"$SCRIPTS_DIR_REAL"'"
  export TMP_DIR="$_main/tmp"
  export LINEAR_API_KEY="test-key"
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
  source '"\"$WORKTREE_SH\""'
  issue_worktree_suffix() { printf "%s\n" "${REPRO_ISSUE_WORKTREE_SUFFIX:-fallback}"; }
  _linear_api() {
    printf '%s' "{\"data\":{\"issues\":{\"nodes\":[{\"id\":\"uuid-1\",\"identifier\":\"REP-812\",\"title\":\"Manage jcodemunch Python dependencies in bootstrap setup\",\"branchName\":\"$issue_branch\",\"team\":{\"states\":{\"nodes\":[{\"id\":\"state-in-progress\",\"name\":\"In Progress\",\"type\":\"started\"}]}}}]}}}"
  }
}

_cleanup() { rm -rf "$_TDIR"; }
trap _cleanup EXIT
'

printf '\nworktree.sh — wt create --from-issue (REP-812)\n\n'

run_git_test "cmd_wt_create_from_issue: creates a fresh unique branch from main" "
$COMMON_SETUP
_src_wt
WT_NO_STATUS_UPDATE=true
REPRO_ISSUE_WORKTREE_SUFFIX=fresh1
output=\"\$(cmd_wt_create_from_issue REP-812 2>&1)\" || {
  echo \"FAIL:\$output\"
  exit 0
}
new_branch=\"\$issue_branch-fresh1\"
new_wt=\"\$_TDIR/repro-wt-rep-812-fresh1\"
if [[ ! -d \"\$new_wt\" ]]; then
  echo \"FAIL:missing worktree path \$new_wt\"
elif [[ \"\$(git -C \"\$new_wt\" branch --show-current)\" != \"\$new_branch\" ]]; then
  echo \"FAIL:expected branch=\$new_branch actual=\$(git -C \"\$new_wt\" branch --show-current)\"
elif git -C \"\$_main\" show \"\$issue_branch:latest-from-main.txt\" >/dev/null 2>&1; then
  echo \"FAIL:stale issue branch unexpectedly contains latest-from-main.txt\"
elif ! git -C \"\$new_wt\" show HEAD:latest-from-main.txt >/dev/null 2>&1; then
  echo \"FAIL:new worktree HEAD does not include latest-from-main.txt\"
else
  echo PASS
fi
"

run_git_test "cmd_wt_create_from_issue: repeated runs use unique branch and path suffixes" "
$COMMON_SETUP
_src_wt
WT_NO_STATUS_UPDATE=true
REPRO_ISSUE_WORKTREE_SUFFIX=first1
output=\"\$(cmd_wt_create_from_issue REP-812 2>&1)\" || {
  echo \"FAIL:first create failed: \$output\"
  exit 0
}
REPRO_ISSUE_WORKTREE_SUFFIX=second2
output=\"\$(cmd_wt_create_from_issue REP-812 2>&1)\" || {
  echo \"FAIL:second create failed: \$output\"
  exit 0
}
if [[ ! -d \"\$_TDIR/repro-wt-rep-812-first1\" ]]; then
  echo \"FAIL:first worktree missing\"
elif [[ ! -d \"\$_TDIR/repro-wt-rep-812-second2\" ]]; then
  echo \"FAIL:second worktree missing\"
elif ! git -C \"\$_main\" rev-parse --verify --quiet \"refs/heads/\$issue_branch-first1\" >/dev/null 2>&1; then
  echo \"FAIL:first unique branch missing\"
elif ! git -C \"\$_main\" rev-parse --verify --quiet \"refs/heads/\$issue_branch-second2\" >/dev/null 2>&1; then
  echo \"FAIL:second unique branch missing\"
else
  echo PASS
fi
"

printf '\n%d/%d tests passed\n' "$PASS" "$TESTS_RUN"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
