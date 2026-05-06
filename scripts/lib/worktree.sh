#!/bin/bash
#
# scripts/lib/worktree.sh — git worktree lifecycle commands
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, MAIN_CHECKOUT, PARENT_DIR, slugify,
# worktree_path, die).

WT_DRY_RUN=false
WT_FROM_ISSUE=""
WT_NO_STATUS_UPDATE=false
WT_ISSUE_LINEAR_SYNCED=false
WT_ISSUE_LINEAR_SYNC_ERROR=""

_linear_api() {
  local query="$1"
  local _tmpfile http_code body
  mkdir -p "$MAIN_CHECKOUT/tmp"
  _tmpfile="$(mktemp "$MAIN_CHECKOUT/tmp/linear-api.XXXXXX")"

  http_code="$(curl -sS -o "$_tmpfile" -w '%{http_code}' -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    --data "{\"query\": $(printf '%s' "$query" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    "https://api.linear.app/graphql")" || { rm -f "$_tmpfile"; die "Failed to reach Linear API (network error)"; }

  body="$(cat "$_tmpfile")"
  rm -f "$_tmpfile"

  if [[ "$http_code" -ge 400 ]]; then
    case "$http_code" in
      401) die "Linear API authentication failed (HTTP 401). Check that LINEAR_API_KEY is valid." ;;
      403) die "Linear API authorization failed (HTTP 403). Your API key may lack required scopes." ;;
      *)   die "Linear API request failed (HTTP $http_code): $body" ;;
    esac
  fi

  if ! printf '%s' "$body" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1; then
    die "Linear API returned non-JSON response (HTTP $http_code)"
  fi

  local errors rc=0
  errors="$(printf '%s' "$body" | python3 "$SCRIPTS_DIR/lib/py/linear_check_errors.py" 2>/dev/null)" || rc=$?
  if [[ $rc -ne 0 ]] && [[ -n "$errors" ]]; then
    die "Linear API error: $errors"
  fi

  printf '%s' "$body"
}

_linear_api_try() {
  local query="$1"
  local stdout_file stderr_file rc=0

  mkdir -p "$MAIN_CHECKOUT/tmp"
  stdout_file="$(mktemp "$MAIN_CHECKOUT/tmp/linear-api-stdout.XXXXXX")"
  stderr_file="$(mktemp "$MAIN_CHECKOUT/tmp/linear-api-stderr.XXXXXX")"

  if ( _linear_api "$query" ) >"$stdout_file" 2>"$stderr_file"; then
    cat "$stdout_file"
    rm -f "$stdout_file" "$stderr_file"
    return 0
  fi

  rc=$?
  if [ -s "$stderr_file" ]; then
    cat "$stderr_file" >&2
  fi
  rm -f "$stdout_file" "$stderr_file"
  return "$rc"
}

issue_worktree_suffix() {
  if [[ -n "${REPRO_ISSUE_WORKTREE_SUFFIX:-}" ]]; then
    printf '%s\n' "$REPRO_ISSUE_WORKTREE_SUFFIX"
    return 0
  fi

  printf '%s-%04x\n' "$(date +%Y%m%d%H%M%S)" "$((RANDOM & 0xffff))"
}

_resolve_issue_worktree_names() {
  local issue_identifier="$1"
  local base_branch_name="$2"
  local issue_slug
  issue_slug="$(printf '%s' "$issue_identifier" | tr '[:upper:]' '[:lower:]')"

  local attempt=0
  while [ "$attempt" -lt 10 ]; do
    local suffix branch_name slug wt_path
    suffix="$(issue_worktree_suffix)"
    branch_name="${base_branch_name}-${suffix}"
    slug="${issue_slug}-${suffix}"
    wt_path="$(worktree_path "$slug")"

    if ! git rev-parse --verify --quiet "refs/heads/$branch_name" >/dev/null 2>&1 && \
      ! git rev-parse --verify --quiet "refs/remotes/origin/$branch_name" >/dev/null 2>&1 && \
      [ ! -d "$wt_path" ]; then
      printf '%s\n%s\n' "$branch_name" "$slug"
      return 0
    fi

    attempt=$((attempt + 1))
  done

  die "Could not generate a unique worktree name for ${issue_identifier}."
}

_latest_main_ref() {
  if git remote get-url origin >/dev/null 2>&1; then
    git fetch origin main >/dev/null 2>&1 || die "Failed to fetch latest main from origin."
    if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null 2>&1; then
      echo "refs/remotes/origin/main"
      return 0
    fi
  fi

  if git rev-parse --verify --quiet refs/heads/main >/dev/null 2>&1; then
    echo "refs/heads/main"
    return 0
  fi

  die "Could not resolve main branch for issue-based worktree creation."
}

_require_worktree_bootstrap_config_sources() {
  if [ ! -f "$MAIN_CHECKOUT/.linear" ] || [ ! -r "$MAIN_CHECKOUT/.linear" ]; then
    die "Missing required worktree bootstrap config at $MAIN_CHECKOUT/.linear. Copy the main checkout's .linear config before creating a new worktree."
  fi
}

_copy_worktree_bootstrap_local_files() {
  local wt_path="$1"

  cp -p "$MAIN_CHECKOUT/.linear" "$wt_path/.linear" ||
    die "Failed to copy $MAIN_CHECKOUT/.linear into $wt_path/.linear"

  if [ -f "$MAIN_CHECKOUT/.envrc.local" ]; then
    cp -p "$MAIN_CHECKOUT/.envrc.local" "$wt_path/.envrc.local" ||
      die "Failed to copy $MAIN_CHECKOUT/.envrc.local into $wt_path/.envrc.local"
  fi
}

_resolve_issue_worktree_metadata() {
  local issue_id="$1"

  if [[ ! "$issue_id" =~ ^[A-Z]+-[0-9]+$ ]]; then
    die "Invalid issue identifier: '$issue_id'. Expected format: REP-123"
  fi

  if [[ -z "${LINEAR_API_KEY:-}" ]]; then
    die "LINEAR_API_KEY environment variable is not set.\nCreate a personal API key at https://linear.app/settings/api\nthen export it in your shell:  export LINEAR_API_KEY=lin_api_..."
  fi

  _step 1 3 "Fetching issue ${issue_id} from Linear..."

  local team_key issue_number
  team_key="${issue_id%%-*}"
  issue_number="${issue_id##*-}"

  local query
  query="{ issues(filter: { number: { eq: ${issue_number} }, team: { key: { eq: \"${team_key}\" } } }, first: 1) { nodes { id identifier title branchName state { name type } team { states { nodes { id name type } } } } } }"

  local response
  response="$(_linear_api "$query")"

  local issue_data
  issue_data="$(printf '%s' "$response" | python3 "$SCRIPTS_DIR/lib/py/linear_parse_issue.py")" || die "Failed to parse Linear API response"

  if [[ -z "$issue_data" ]]; then
    die "Failed to parse Linear API response for ${issue_id}"
  fi

  if [[ "$issue_data" == "NOT_FOUND" ]]; then
    die "Issue ${issue_id} not found in Linear."
  fi

  local issue_uuid issue_identifier issue_title branch_name in_progress_state_id
  issue_uuid="$(sed -n '1p' <<< "$issue_data")"
  issue_identifier="$(sed -n '2p' <<< "$issue_data")"
  issue_title="$(sed -n '3p' <<< "$issue_data")"
  branch_name="$(sed -n '4p' <<< "$issue_data")"
  in_progress_state_id="$(sed -n '5p' <<< "$issue_data")"
  local issue_state_name issue_state_type
  issue_state_name="$(sed -n '6p' <<< "$issue_data")"
  issue_state_type="$(sed -n '7p' <<< "$issue_data")"

  if [[ -z "$branch_name" ]]; then
    die "No branch name returned by Linear for ${issue_identifier}."
  fi

  local issue_names fresh_branch fresh_slug start_ref
  WT_ISSUE_UUID="$issue_uuid"
  WT_ISSUE_IDENTIFIER="$issue_identifier"
  WT_ISSUE_TITLE="$issue_title"
  WT_ISSUE_BRANCH_NAME="$branch_name"
  WT_ISSUE_STATE_NAME="$issue_state_name"
  WT_ISSUE_STATE_TYPE="$issue_state_type"
  WT_ISSUE_IN_PROGRESS_STATE_ID="$in_progress_state_id"
}

_populate_issue_worktree_names() {
  local issue_names fresh_branch fresh_slug start_ref
  issue_names="$(_resolve_issue_worktree_names "$WT_ISSUE_IDENTIFIER" "$WT_ISSUE_BRANCH_NAME")"
  fresh_branch="$(sed -n '1p' <<< "$issue_names")"
  fresh_slug="$(sed -n '2p' <<< "$issue_names")"
  start_ref="$(_latest_main_ref)"

  WT_ISSUE_WORKTREE_BRANCH="$fresh_branch"
  WT_ISSUE_WORKTREE_SLUG="$fresh_slug"
  WT_ISSUE_WORKTREE_PATH="$(worktree_path "$fresh_slug")"
  WT_ISSUE_START_REF="$start_ref"
}

_create_issue_worktree_from_metadata() {
  WT_ISSUE_LINEAR_SYNCED=false
  WT_ISSUE_LINEAR_SYNC_ERROR=""
  _ok "Found: ${WT_ISSUE_IDENTIFIER} — ${WT_ISSUE_TITLE}"
  echo "  Branch: ${WT_ISSUE_WORKTREE_BRANCH}"
  echo "  Slug:   ${WT_ISSUE_WORKTREE_SLUG}"
  echo ""

  cmd_wt_create "$WT_ISSUE_WORKTREE_BRANCH" "$WT_ISSUE_WORKTREE_SLUG" "$WT_ISSUE_START_REF" || return $?

  if [[ "$WT_NO_STATUS_UPDATE" != true ]]; then
    if [[ -n "$WT_ISSUE_IN_PROGRESS_STATE_ID" ]]; then
      _step 3 3 "Updating ${WT_ISSUE_IDENTIFIER} status to In Progress..."
      local mutation
      mutation="mutation { issueUpdate(id: \"${WT_ISSUE_UUID}\", input: { stateId: \"${WT_ISSUE_IN_PROGRESS_STATE_ID}\" }) { issue { id identifier } } }"
      if _linear_api_try "$mutation" > /dev/null; then
        WT_ISSUE_LINEAR_SYNCED=true
        _ok "Issue ${WT_ISSUE_IDENTIFIER} marked In Progress"
      else
        WT_ISSUE_LINEAR_SYNC_ERROR="Failed to update Linear state to In Progress"
      fi
    else
      WT_ISSUE_LINEAR_SYNC_ERROR="Could not find 'In Progress' state"
      echo "  ${CLR_DIM}Could not find 'In Progress' state — skipping status update${CLR_RESET}"
    fi
  fi
}

cmd_wt_create_from_issue() {
  local issue_id="$1"

  _resolve_issue_worktree_metadata "$issue_id"
  _populate_issue_worktree_names
  _create_issue_worktree_from_metadata
} >&2

cmd_wt_create() {
  local branch="$1"
  local slug="${2:-$(slugify "$branch")}"
  local start_ref="${3:-}"
  local wt_path
  wt_path="$(worktree_path "$slug")"

  echo "${CLR_BOLD}Creating worktree for branch:${CLR_RESET} $branch"
  echo "  Path: $wt_path"

  if ! _require_worktree_bootstrap_config_sources; then
    return 1
  fi

  if [ "$WT_DRY_RUN" = true ]; then
    echo ""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: git worktree add ... \"$wt_path\" \"$branch\""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would copy: $MAIN_CHECKOUT/.linear -> $wt_path/.linear"
    if [ -f "$MAIN_CHECKOUT/.envrc.local" ]; then
      echo "${CLR_DIM}[dry-run]${CLR_RESET} Would copy: $MAIN_CHECKOUT/.envrc.local -> $wt_path/.envrc.local"
    fi
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: pnpm install (in $wt_path)"
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: moon run :build (in $wt_path)"

    if command -v direnv > /dev/null 2>&1; then
      echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: direnv allow (in $wt_path)"
    fi
    echo ""
    echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
    return 0
  fi

  if [ -d "$wt_path" ]; then
    _err "Worktree already exists at $wt_path"
    echo "  To remove it: reproctl worktree remove $branch" >&2
    exit 1
  fi

  local has_direnv=false
  if command -v direnv > /dev/null 2>&1; then
    has_direnv=true
  fi

  local total_steps=4
  if [ "$has_direnv" = true ]; then
    total_steps=5
  fi

  local step=1
  _step "$step" "$total_steps" "Creating git worktree..."
  if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    git worktree add "$wt_path" "$branch"
  elif git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null 2>&1; then
    git worktree add "$wt_path" "$branch"
  elif [ -n "$start_ref" ]; then
    echo "  Branch '$branch' does not exist locally or on remote, creating from $start_ref..."
    git worktree add -b "$branch" "$wt_path" "$start_ref"
  else
    echo "  Branch '$branch' does not exist locally or on remote, creating from HEAD..."
    git worktree add -b "$branch" "$wt_path"
  fi

  step=$((step + 1))
  _step "$step" "$total_steps" "Copying local worktree config..."
  if ! _copy_worktree_bootstrap_local_files "$wt_path"; then
    return 1
  fi

  step=$((step + 1))
  _step "$step" "$total_steps" "Installing dependencies..."
  (cd "$wt_path" && pnpm install)

  step=$((step + 1))
  _step "$step" "$total_steps" "Building packages..."
  (cd "$wt_path" && moon run :build)

  if [ "$has_direnv" = true ] && [ -f "$wt_path/.envrc" ]; then
    step=$((step + 1))
    _step "$step" "$total_steps" "Allowing direnv..."
    local main_allowed=false
    if (cd "$MAIN_CHECKOUT" && direnv status 2>/dev/null) | grep -q "Found RC allowed 0"; then
      main_allowed=true
    fi

    if [ "$main_allowed" = true ]; then
      (cd "$wt_path" && direnv allow)
    else
      echo "  ${CLR_DIM}Skipped (not allowed in main checkout)${CLR_RESET}"
    fi
  fi

  echo ""
  _ok "Worktree ready"
  echo ""
  echo "  Branch: $branch"
  echo "  Path:   $wt_path"
  echo ""
  echo "  cd $wt_path"
  echo ""

} >&2

_cleanup_worktree_services() {
  local wt_path="$1"
  local slug
  slug="$(basename "$wt_path")"
  slug="${slug#repro-wt-}"

  if [ ! -f "$CONFIG_FILE" ]; then
    return 0
  fi

  local current_config
  current_config="$(cat "$CONFIG_FILE")"

  local svc_names svc_err
  mkdir -p "$MAIN_CHECKOUT/tmp"
  svc_err="$(mktemp "$MAIN_CHECKOUT/tmp/worktree-services.XXXXXX")"
  svc_names="$(python3 "$SCRIPTS_DIR/lib/py/worktree_services.py" "$current_config" "$slug" 2>"$svc_err")" || {
    local err_msg
    err_msg="$(cat "$svc_err")"
    rm -f "$svc_err"
    _warn "could not determine services for worktree '${slug}': ${err_msg}"
    return 0
  }
  rm -f "$svc_err"

  if [ -z "$svc_names" ]; then
    return 0
  fi

  _drop_worktree_db "$slug" "$svc_names"

  echo "  Stopping services for worktree ${slug}: ${svc_names}"

  local entries=()
  local IFS=','
  for name in $svc_names; do
    name="$(echo "$name" | sed 's/^ *//')"
    entries+=("$slug:$name")
  done
  unset IFS

  local new_config
  new_config="$(remove_services "$current_config" "${entries[@]}")"

  local remaining
  remaining="$(service_count "$new_config")"

  if [ "$remaining" = "0" ]; then
    stop_tilt_daemon
  else
    write_config "$new_config"
  fi
} >&2

_drop_worktree_db() {
  local slug="$1"
  local svc_names="$2"

  case ",$svc_names," in
    *,api-server,*|*", api-server,"*) ;;
    *) return 0 ;;
  esac

  local db_name="repro_wt_$(printf '%s' "$slug" | tr '-' '_')"

  local psql_bin
  psql_bin="$(command -v psql 2>/dev/null || true)"
  if [ -z "$psql_bin" ] && [ -x "/opt/homebrew/opt/postgresql@17/bin/psql" ]; then
    psql_bin="/opt/homebrew/opt/postgresql@17/bin/psql"
  fi

  if [ -z "$psql_bin" ]; then
    _warn "psql not found — skipping database cleanup for $db_name"
    return 0
  fi

  if ! PGPASSWORD=repro "$psql_bin" -h localhost -p 15432 -U repro -d postgres \
    -tc "SELECT 1 FROM pg_database WHERE datname = '$db_name'" 2>/dev/null | grep -q 1; then
    return 0
  fi

  echo "  Dropping worktree database: $db_name"
  PGPASSWORD=repro "$psql_bin" -h localhost -p 15432 -U repro -d postgres \
    -c "DROP DATABASE IF EXISTS $db_name" 2>/dev/null || {
    _warn "failed to drop database $db_name"
  }
} >&2

# _wt_change_state <wt_path>
# Prints one of: clean | has-tracked-changes | has-untracked
#
# has-tracked-changes — staged or unstaged changes in tracked paths; represents
#                       real uncommitted work that should block automated pruning.
# has-untracked       — untracked non-ignored files exist, but no tracked changes;
#                       may be WIP scratch files, but safe to force-remove.
# clean               — no staged/unstaged tracked changes, no untracked non-ignored
#                       files (git-ignored artifacts fall through to this state).
#
# Bash 3.2-compatible (no declare -A, no ${var,,}, no mapfile)
_wt_change_state() {
  local wt_path="$1"

  # Staged changes
  if ! git -C "$wt_path" diff --cached --quiet 2>/dev/null; then
    echo "has-tracked-changes"
    return
  fi

  # Unstaged changes in tracked paths
  if ! git -C "$wt_path" diff --quiet 2>/dev/null; then
    echo "has-tracked-changes"
    return
  fi

  # Untracked non-ignored files (potential WIP, but not committed work)
  if git -C "$wt_path" ls-files --others --exclude-standard --directory 2>/dev/null | grep -q .; then
    echo "has-untracked"
    return
  fi

  # Git-ignored files only (e.g. tmp/, node_modules/, build artifacts) fall
  # through to clean — they are always safe to purge without acknowledgement.
  echo "clean"
}
cmd_wt_remove() {
  local input="$1"
  local wt_path
  # resolve_worktree tries slug-path first, then branch-name lookup — accepts
  # both a bare slug (e.g. rep-123) and a full branch name.
  wt_path="$(resolve_worktree "$input")" || wt_path=""

  # Guard: directory must exist AND be a registered git worktree. An accidental
  # directory that isn't tracked by git should be treated as "not found".
  if [ -z "$wt_path" ] || [ ! -d "$wt_path" ] || ! _worktree_branch_for_path "$wt_path" >/dev/null 2>&1; then
    if [ "$WT_DRY_RUN" = true ]; then
      echo "${CLR_DIM}[dry-run]${CLR_RESET} No worktree found for: $input"
      return 0
    fi
    _err "No worktree found for: $input"
    echo "  Run 'reproctl worktree list' to see active worktrees." >&2
    git worktree prune
    return 1
  fi

  echo "${CLR_BOLD}Removing worktree for:${CLR_RESET} $input"
  echo "  Path: $wt_path"

  if [ "$WT_DRY_RUN" = true ]; then
    echo ""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: git worktree remove \"$wt_path\""
  echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: git worktree prune"
  echo ""
  echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
  return 0
  fi

  local _force_remove=false

  if [ "${WT_FORCE:-false}" = true ]; then
    # --force bypasses all checks; existing behaviour unchanged
    _force_remove=true
  else
    local _state
    _state="$(_wt_change_state "$wt_path")"
    case "$_state" in
      clean)
        # Nothing extra needed; standard remove works
        ;;
      has-untracked)
        # Untracked non-ignored files present, but no tracked changes.
        # In non-interactive (--yes) mode these are safe to force-remove;
        # in interactive mode, still prompt so the user can inspect them.
        if [ "${WT_YES:-false}" = true ]; then
          _force_remove=true
        fi
        ;;
      has-tracked-changes)
        # WT_YES is set internally by cmd_wt_prune; not available via CLI for 'remove'
        if [ "${WT_YES:-false}" = true ]; then
          # Non-interactive path (e.g. post-merge hook): skip with warning, return 0
          _warn "Skipping $wt_path: has uncommitted changes (use --force to override)"
          return 0
        fi
        ;;
    esac
    # Interactive prompt for has-tracked-changes or has-untracked (with WT_YES=false).
    # Skip if _force_remove was already resolved in the WT_YES path above.
    if [ "$_force_remove" = false ] && { [ "$_state" = "has-tracked-changes" ] || [ "$_state" = "has-untracked" ]; }; then
      if ! { true </dev/tty; } 2>/dev/null; then
        # No TTY: fail loudly so caller is aware
        _err "Worktree has uncommitted changes: $wt_path (use --force to override)"
        return 1
      else
        # Interactive: show categorised status via git status --porcelain, then ask
        local _porcelain
        _porcelain="$(git -C "$wt_path" status --porcelain 2>/dev/null || true)"

        # Tracked changes: lines where the first char is not ' ' or '?'
        local _tracked_lines
        _tracked_lines="$(printf '%s\n' "$_porcelain" | grep -v '^??' | grep -v '^  ' | sed 's/^...//' || true)"

        # Untracked: lines starting with '??'
        local _untracked_lines
        _untracked_lines="$(printf '%s\n' "$_porcelain" | grep '^??' | sed 's/^?? //' || true)"

        if [ -n "$_tracked_lines" ]; then
          echo "" >&2
          echo "${CLR_BOLD}Uncommitted changes:${CLR_RESET}" >&2
          printf '%s\n' "$_tracked_lines" | sed 's/^/  /' >&2
        fi

        if [ -n "$_untracked_lines" ]; then
          echo "" >&2
          echo "${CLR_BOLD}Untracked files:${CLR_RESET}" >&2
          printf '%s\n' "$_untracked_lines" | sed 's/^/  /' >&2
        fi
        echo "" >&2
        local _answer
        read -r -p "Discard changes and remove? [y/N] " _answer </dev/tty
        case "$_answer" in
          [yY]) _force_remove=true ;;
          *)
            echo "Keeping worktree: $wt_path" >&2
            return 0
            ;;
        esac
      fi
    fi
  fi
  _cleanup_worktree_services "$wt_path"

  _step 1 2 "Removing git worktree..."
  if [ "${WT_FORCE:-false}" = true ]; then
    git worktree remove --force "$wt_path" || return $?
  else
    git worktree remove "$wt_path" || return $?
  fi

  _step 2 2 "Pruning stale entries..."
  git worktree prune

  echo ""
  _ok "Worktree removed: $wt_path"
} >&2

cmd_wt_prune() {
  if [ "$WT_DRY_RUN" = true ]; then
    _step 1 2 "[dry-run] Skipping fetch/prune of remote refs..."
  else
    _step 1 2 "Fetching and pruning remote refs..."
    if ! git remote get-url origin >/dev/null 2>&1; then
      die "Remote 'origin' does not exist; cannot prune worktrees."
    fi
    if ! git fetch --prune origin; then
      die "Failed to fetch from 'origin'; aborting worktree prune."
    fi
  fi

  _step 2 2 "Scanning worktrees for merged branches..."

  local candidates=()
  local wt_path="" wt_branch="" wt_bare=false wt_detached=false

  _prune_flush() {
    if [ -z "$wt_path" ]; then
      return
    fi

    if [ "$wt_path" = "$MAIN_CHECKOUT" ]; then
      wt_path="" wt_branch="" wt_bare=false wt_detached=false
      return
    fi

    if [ "$wt_bare" = true ] || [ "$wt_detached" = true ] || [ -z "$wt_branch" ]; then
      wt_path="" wt_branch="" wt_bare=false wt_detached=false
      return
    fi

    if [ "$wt_path" = "$REPO_ROOT" ]; then
      wt_path="" wt_branch="" wt_bare=false wt_detached=false
      return
    fi

    local basename
    basename="$(basename "$wt_path")"
    if [[ "$basename" != repro-wt-* ]]; then
      wt_path="" wt_branch="" wt_bare=false wt_detached=false
      return
    fi

    local merged=false

    if git merge-base --is-ancestor "refs/heads/$wt_branch" refs/heads/main 2>/dev/null; then
      merged=true
    else
      local upstream_remote upstream_merge
      upstream_remote="$(git config "branch.$wt_branch.remote" 2>/dev/null || true)"
      upstream_merge="$(git config "branch.$wt_branch.merge" 2>/dev/null || true)"
      if [ "$upstream_remote" = "origin" ] && [ "$upstream_merge" = "refs/heads/$wt_branch" ]; then
        if ! git rev-parse --verify --quiet "refs/remotes/origin/$wt_branch" >/dev/null 2>&1; then
          merged=true
        fi
      fi
    fi

    if [ "$merged" = true ]; then
      candidates+=("$wt_branch")
    fi

    wt_path="" wt_branch="" wt_bare=false wt_detached=false
  }

  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      bare)        wt_bare=true ;;
      detached)    wt_detached=true ;;
      "")          _prune_flush ;;
    esac
  done < <(git worktree list --porcelain)
  _prune_flush

  if [ ${#candidates[@]} -eq 0 ]; then
    echo ""
    echo "No worktrees eligible for pruning."
    return 0
  fi

  echo ""
  echo "${CLR_BOLD}Worktrees eligible for pruning:${CLR_RESET}"
  for branch in "${candidates[@]}"; do
    echo "  ${CLR_DIM}•${CLR_RESET} $branch"
  done
  echo ""

  if [ "$WT_DRY_RUN" = true ]; then
    echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
    return 0
  fi

  if [ "$WT_YES" != true ]; then
    local answer
    read -r -p "Remove these worktrees? [y/N] " answer
    case "$answer" in
      [yY]) ;;
      *)
        echo "Aborted." >&2
        exit 2
        ;;
    esac
  fi

  local failed=0
  for branch in "${candidates[@]}"; do
    if ! cmd_wt_remove "$branch"; then
      failed=$((failed + 1))
    fi
  done

  echo ""
  if [ "$failed" -eq 0 ]; then
    _ok "Pruned ${#candidates[@]} worktree(s)"
  else
    _err "Pruned with $failed error(s)"
  fi
} >&2

cmd_wt_list() {
  echo "${CLR_BOLD}Active worktrees:${CLR_RESET}"
  echo ""

  local active_services=""
  if [ -f "$CONFIG_FILE" ]; then
    active_services="$(cat "$CONFIG_FILE")"
  fi

  local slugs=() branches=() services_list=()
  local max_slug=4 max_branch=6

  local wt_path="" wt_branch="" wt_bare=false wt_detached=false

  _wt_list_flush() {
    [ -z "$wt_path" ] && return

    local slug basename
    basename="$(basename "$wt_path")"
    if [[ "$basename" == repro-wt-* ]]; then
      slug="${basename#repro-wt-}"
    else
      slug="main"
    fi

    if [ "$wt_bare" = true ]; then
      wt_branch="(bare)"
    elif [ "$wt_detached" = true ]; then
      wt_branch="(detached HEAD)"
    fi

    local svc_names=""
    if [ -n "$active_services" ] && command -v python3 > /dev/null 2>&1; then
      svc_names="$(python3 "$SCRIPTS_DIR/lib/py/worktree_services.py" "$active_services" "$slug" 2>/dev/null || true)"
    fi

    slugs+=("$slug")
    branches+=("$wt_branch")
    services_list+=("$svc_names")

    [ ${#slug} -gt $max_slug ] && max_slug=${#slug}
    [ ${#wt_branch} -gt $max_branch ] && max_branch=${#wt_branch}

    wt_path="" wt_branch="" wt_bare=false wt_detached=false
  }

  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      bare)        wt_bare=true ;;
      detached)    wt_detached=true ;;
      "")          _wt_list_flush ;;
    esac
  done < <(git worktree list --porcelain)
  _wt_list_flush

  printf "  ${CLR_BOLD}%-${max_slug}s  %-${max_branch}s  %s${CLR_RESET}\n" "SLUG" "BRANCH" "SERVICES"

  local i
  for i in "${!slugs[@]}"; do
    local svc_display="${services_list[$i]}"
    if [ -z "$svc_display" ]; then
      svc_display="${CLR_DIM}(none)${CLR_RESET}"
    fi
    printf "  %-${max_slug}s  %-${max_branch}s  %s\n" "${slugs[$i]}" "${branches[$i]}" "$svc_display"
  done

  echo ""
}

cmd_wt_list_json() {
  local active_services=""
  if [ -f "$CONFIG_FILE" ]; then
    active_services="$(cat "$CONFIG_FILE")"
  fi

  local porcelain
  porcelain="$(git worktree list --porcelain)"

  python3 "$SCRIPTS_DIR/lib/py/worktree_list_json.py" "$porcelain" "$active_services"
}

resolve_worktree() {
  local input="$1"

  local slug_path
  slug_path="$(worktree_path "$input")"
  if [[ -d "$slug_path" ]]; then
    echo "$slug_path"
    return 0
  fi

  local lower_input
  lower_input="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"
  if [[ "$lower_input" != "$input" ]]; then
    slug_path="$(worktree_path "$lower_input")"
    if [[ -d "$slug_path" ]]; then
      echo "$slug_path"
      return 0
    fi
  fi

  _worktree_path_for_branch "$input" && return 0

  return 1
}

_worktree_branch_for_path() {
  local target="$1"
  local wt_path="" wt_branch=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      "")
        if [[ "$wt_path" == "$target" ]]; then
          if [[ -z "$wt_branch" ]]; then
            return 1
          fi
          echo "$wt_branch"
          return 0
        fi
        wt_path="" wt_branch=""
        ;;
    esac
  done < <(git worktree list --porcelain)
  if [[ "$wt_path" == "$target" ]]; then
    if [[ -z "$wt_branch" ]]; then
      return 1
    fi
    echo "$wt_branch"
    return 0
  fi

  return 1
}

_worktree_path_for_branch() {
  local target="$1"
  local wt_path="" wt_branch=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      "")
        if [[ "$wt_branch" == "$target" ]]; then
          echo "$wt_path"
          return 0
        fi
        wt_path="" wt_branch=""
        ;;
    esac
  done < <(git worktree list --porcelain)
  if [[ "$wt_branch" == "$target" ]]; then
    echo "$wt_path"
    return 0
  fi

  return 1
}

_list_available_worktrees() {
  local wt_path="" wt_branch="" wt_bare=false wt_detached=false
  local entries=()

  _avail_flush() {
    if [[ -z "$wt_path" ]]; then return; fi
    if [[ "$wt_bare" != true ]]; then
      local basename
      basename="$(basename "$wt_path")"
      if [[ "$basename" == repro-wt-* ]]; then
        local slug="${basename#repro-wt-}"
        if [[ "$wt_detached" == true ]]; then
          entries+=("  $slug  (detached HEAD)")
        else
          entries+=("  $slug  $wt_branch")
        fi
      fi
    fi
    wt_path="" wt_branch="" wt_bare=false wt_detached=false
  }

  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      bare)        wt_bare=true ;;
      detached)    wt_detached=true ;;
      "")          _avail_flush ;;
    esac
  done < <(git worktree list --porcelain)
  _avail_flush

  if [[ ${#entries[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    printf '%s\n' "${entries[@]}"
  fi
}

cmd_attach() {
  local input="$1"
  local wt_path
  wt_path="$(resolve_worktree "$input")" || true

  if [[ -z "$wt_path" ]] || [[ ! -d "$wt_path" ]]; then
    {
      printf "No worktree found for '%s'.\n\n" "$input"
      printf "Available worktrees:\n"
      _list_available_worktrees
      printf "\n  Create one: reproctl worktree create %s\n" "$input"
    } >&2
    exit 1
  fi

  local branch
  branch="$(_worktree_branch_for_path "$wt_path")" || branch="$input"

  local slug basename
  basename="$(basename "$wt_path")"
  slug="${basename#repro-wt-}"

  echo "Attached to worktree: $branch"
  echo "  Path: $wt_path"
  echo "  Exit the shell (exit or Ctrl-D) to return."

  (cd "$wt_path" && \
    REPRO_WORKTREE="$slug" \
    REPRO_WORKTREE_BRANCH="$branch" \
    REPRO_WORKTREE_PATH="$wt_path" \
    exec "$SHELL")

  echo "Detached from worktree: $branch"
} >&2

wt_usage() {
  cat <<'EOF'
Usage: reproctl worktree <command> [options] [args]

Commands:
  create [options] <branch>        Create a new worktree for the given branch
  create --from-issue <id>         Create a worktree from a Linear issue
  remove [options] <slug|branch>   Remove the worktree for the given slug or branch
  list                        List all active worktrees
  attach <slug|branch>        Drop into a subshell in the given worktree
  prune  [options]            Remove worktrees whose branches are merged

Options (create):
  --from-issue, -i <id>   Fetch branch name from a Linear issue (e.g. REP-123)
  --no-status-update      Skip setting the Linear issue to In Progress
  --dry-run               Preview what would be done without making changes

Options (list):
  --json              Output worktree data as a JSON array

Options (remove):
  --force, -f       Force-remove worktree even if it has uncommitted changes
  --dry-run         Preview what would be done without making changes

Options (prune):
  --yes, -y         Skip confirmation prompt
  --force, -f       Force-remove worktrees even if they have uncommitted changes
  --dry-run         Preview what would be done without making changes

Interactive picker:
  When 'attach' or 'remove' is invoked without a branch name and
  stdin is a terminal, an interactive picker is shown (fzf if available,
  numbered prompt otherwise).

Examples:
  reproctl worktree create feat/my-feature      # checkout existing branch
  reproctl worktree create feat/new-feature     # auto-creates branch if needed
  reproctl worktree create -i REP-123           # create from Linear issue
  reproctl worktree remove rep-123              # remove worktree by slug
  reproctl worktree remove feat/my-feature      # remove worktree by branch name
  reproctl worktree remove --force rep-123      # force-remove (uncommitted changes ok)
  reproctl worktree remove                      # pick interactively
  reproctl worktree list                        # list all worktrees
  reproctl worktree list --json                 # list as JSON (for tooling)
  reproctl worktree attach rep-123              # drop into worktree subshell by slug
  reproctl worktree attach feat/my-feature      # drop into worktree subshell by branch
  reproctl worktree attach                      # pick interactively
  reproctl worktree prune --dry-run             # preview merged worktrees
  reproctl worktree prune --yes                 # prune without confirmation
  reproctl worktree prune --force               # prune including worktrees with uncommitted changes
EOF
}

cmd_wt() {
  if [ $# -eq 0 ]; then
    wt_usage >&2
    exit 1
  fi

  WT_DRY_RUN=false
  WT_YES=false
  WT_FORCE=false
  WT_JSON=false
  WT_FROM_ISSUE=""
  WT_NO_STATUS_UPDATE=false

  local subcmd=""
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        wt_usage
        exit 0
        ;;
      create|remove|list|attach|prune)
        subcmd="$1"
        shift
        break
        ;;
      *)
        die "Unknown worktree command: $1\nRun 'reproctl worktree --help' for usage."
        ;;
    esac
  done

  if [ -z "$subcmd" ]; then
    wt_usage >&2
    exit 1
  fi

  # Parse subcommand-level options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        WT_DRY_RUN=true
        shift
        ;;
      --yes|-y)
        WT_YES=true
        shift
        ;;
      --force|-f)
        WT_FORCE=true
        shift
        ;;
      --json)
        WT_JSON=true
        shift
        ;;
      --from-issue|-i)
        if [[ -z "${2:-}" ]]; then
          die "--from-issue requires an issue identifier (e.g. REP-123)"
        fi
        WT_FROM_ISSUE="$2"
        shift 2
        ;;
      --no-status-update)
        WT_NO_STATUS_UPDATE=true
        shift
        ;;
      -h|--help)
        wt_usage
        exit 0
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done

  if [ "$WT_DRY_RUN" = true ] && [ "$subcmd" = "attach" ]; then
    die "--dry-run flag cannot be used with 'attach'"
  fi

  if [ "$WT_YES" = true ] && [ "$subcmd" != "prune" ]; then
    die "--yes flag can only be used with 'prune'"
  fi

  if [ "$WT_FORCE" = true ] && [ "$subcmd" != "prune" ] && [ "$subcmd" != "remove" ]; then
    die "--force flag can only be used with 'prune' or 'remove'"
  fi

  if [[ -n "$WT_FROM_ISSUE" && "$subcmd" != "create" ]]; then
    die "--from-issue can only be used with 'create'"
  fi

  if [[ "$WT_NO_STATUS_UPDATE" == true && -z "$WT_FROM_ISSUE" ]]; then
    die "--no-status-update can only be used with --from-issue"
  fi

  if [[ "${WT_JSON:-}" == true && "$subcmd" != "list" ]]; then
    die "--json can only be used with 'list'"
  fi


  case "$subcmd" in
    create)
      if [[ -n "$WT_FROM_ISSUE" ]]; then
        if [[ "${#args[@]}" -gt 0 ]]; then
          die "Cannot specify both --from-issue and a branch name"
        fi
        cmd_wt_create_from_issue "$WT_FROM_ISSUE"
      else
        if [ "${#args[@]}" -lt 1 ]; then
          die "'worktree create' requires a branch name (or use --from-issue)"
        fi
        if ! git check-ref-format "refs/heads/${args[0]}" >/dev/null 2>&1; then
          die "'${args[0]}' is not a valid branch name."
        fi
        cmd_wt_create "${args[0]}"
      fi
      ;;
    remove)
      if [ "${#args[@]}" -lt 1 ]; then
        if [ -t 0 ]; then
          local candidates=()
          while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_worktree_branches)
          local selected
          selected="$(_pick "Select worktree to remove" "${candidates[@]}")" || exit $?
          args=("$selected")
        else
          die "'worktree remove' requires a slug or branch name"
        fi
      fi
      # Accept bare slugs (e.g. rep-123) as well as full branch names.
      # Only apply strict git ref validation when the input contains a slash,
      # which unambiguously signals a branch name.
      if [[ "${args[0]}" == */* ]]; then
        if ! git check-ref-format "refs/heads/${args[0]}" >/dev/null 2>&1; then
          die "'${args[0]}' is not a valid branch name."
        fi
      fi
      cmd_wt_remove "${args[0]}"
      ;;
    list)
      if [ "$WT_JSON" = true ] || [ "${REPROCTL_JSON:-false}" = true ]; then
        cmd_wt_list_json
      else
        cmd_wt_list
      fi
      ;;
    attach)
      if [ "${#args[@]}" -lt 1 ]; then
        if [ -t 0 ]; then
          local candidates=()
          while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_worktree_branches)
          local selected
          selected="$(_pick "Select worktree to attach" "${candidates[@]}")" || exit $?
          args=("$selected")
        else
          die "'worktree attach' requires a branch name"
        fi
      fi
      cmd_attach "${args[0]}"
      ;;
    prune)
      cmd_wt_prune
      ;;
  esac
}
