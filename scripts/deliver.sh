#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared libraries for helpers (color, output, REPO_ROOT, worktree_path, herdr helpers)
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/worktree.sh"

# ── jq availability guard ──────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed." >&2
  echo "  Install it: brew install jq" >&2
  exit 1
fi

# ── Usage ──────────────────────────────────────────────────────────
usage_text() {
  cat >&2 <<EOF
Usage: deliver [options] [<issue-id> | <pr-number> | <branch-name>]

  Creates an isolated worktree and opens an OpenCode session.

Modes:
  issue-id        Deliver a Linear issue (e.g. REP-123)
  --pr <N>        Adopt a GitHub PR by number
  -p <desc>       Prompt mode — start spike from description
  <branch-name>   Bare branch mode — work from existing branch

  Routing:
    Bug issues               → /bugfix
    Pen issues               → /pen-reconcile
    All others               → /build

  Flags:
    --profile <name>         Use the specified OpenCode profile
    --pick                   Interactive profile picker
    --dry-run                Preview actions without executing
    --nightshift             Run with autonomous permissions (acceptEdits)
    --pr <number>            PR adoption mode
    -p <description>         Prompt/spike mode
    --help, -h               Show this help message

  Examples:
    deliver REP-123
    deliver --profile beta REP-123
    deliver --pick --pr 42
    deliver --dry-run -p "add dark mode"
    deliver --dry-run feat/my-branch
    deliver --pr 42 --nightshift

EOF
}

usage() {
  usage_text
  exit 1
}

# ── Command resolution ─────────────────────────────────────────────
# Resolve delivery command based on Linear issue labels.
# Bug → /bugfix, Pen → /pen-reconcile, everything else → /build (fail-open).
# Labels live under .item in the linear CLI JSON envelope.
_resolve_command_from_json() {
  local json_output="$1"

  if printf '%s' "$json_output" | jq -e '
    .item.labels // [] | map(select(.name == "Bug")) | length > 0
  ' >/dev/null 2>&1; then
    echo "/bugfix"
  elif printf '%s' "$json_output" | jq -e '
    .item.labels // [] | map(select(.name == "Pen")) | length > 0
  ' >/dev/null 2>&1; then
    echo "/pen-reconcile"
  else
    echo "/build"
  fi
}

resolve_command() {
  local issue_id="$1"

  if ! command -v linear > /dev/null 2>&1; then
    echo "/build"
    return 0
  fi

  local json_output
  json_output="$(linear issue show "$issue_id" --json 2>/dev/null)" || {
    echo "/build"
    return 0
  }

  if [[ -z "$json_output" ]]; then
    echo "/build"
    return 0
  fi

  _resolve_command_from_json "$json_output"
}

_validate_issue_id() {
  local issue_id="$1"

  if [[ "$issue_id" =~ ^REP-[0-9]+$ ]]; then
    return 0
  fi

  _err "Invalid issue ID '$issue_id'."
  echo "  Expected a Repro issue ID in the form REP-123." >&2
  echo "  Run 'deliver --help' for usage." >&2
  return 1
}

DELIVER_LINEAR_STDERR_FILE=""
_deliver_cleanup_linear_stderr() {
  if [[ -n "$DELIVER_LINEAR_STDERR_FILE" ]]; then
    local stderr_file="$DELIVER_LINEAR_STDERR_FILE"
    DELIVER_LINEAR_STDERR_FILE=""
    rm -f "$stderr_file" >/dev/null 2>&1 || true
  fi
}

_deliver_handle_linear_lookup_signal() {
  local exit_status="$1"
  _deliver_cleanup_linear_stderr
  exit "$exit_status"
}

# ── Mode functions ─────────────────────────────────────────────────
_mode_issue_id() {
  local issue_id="$1"
  _validate_issue_id "$issue_id" || return 1

  if ! command -v linear > /dev/null 2>&1; then
    _err "Cannot look up Linear issue $issue_id: the Linear CLI is not available."
    echo "  Check that the Linear CLI is installed and on PATH." >&2
    echo "  Expected issue ID format: REP-123. Run 'deliver --help' for usage." >&2
    return 1
  fi

  local issue_json branch title delivery_command resolved_issue_id
  local linear_stderr_file linear_stderr lookup_status
  linear_stderr_file="$(mktemp "$REPO_ROOT/tmp/deliver-linear.XXXXXX" 2>/dev/null)" || {
    _err "Cannot look up Linear issue $issue_id: could not capture lookup diagnostics."
    echo "  Ensure $REPO_ROOT/tmp exists and is writable, then retry." >&2
    return 1
  }
  DELIVER_LINEAR_STDERR_FILE="$linear_stderr_file"
  trap '_deliver_cleanup_linear_stderr' EXIT
  trap '_deliver_handle_linear_lookup_signal 129' HUP
  trap '_deliver_handle_linear_lookup_signal 130' INT
  trap '_deliver_handle_linear_lookup_signal 143' TERM

  if issue_json="$(linear issue show "$issue_id" --json 2>"$linear_stderr_file")"; then
    lookup_status=0
  else
    lookup_status=$?
  fi
  linear_stderr="$(cat "$linear_stderr_file" 2>/dev/null || true)"
  _deliver_cleanup_linear_stderr

  if [[ "$lookup_status" -ne 0 ]]; then
    if [[ "$linear_stderr" == "Issue $issue_id not found." ]]; then
      _err "Linear issue $issue_id was not found."
      echo "  Check that the issue exists and the ID is correct (expected format: REP-123)." >&2
      echo "  Run 'deliver --help' for usage." >&2
      [[ -z "$linear_stderr" ]] || printf '  Linear: %s\n' "$linear_stderr" >&2
    else
      _err "Linear lookup failed for issue $issue_id."
      if [[ -n "$linear_stderr" ]]; then
        printf '  Linear: %s\n' "$linear_stderr" >&2
      else
        printf '  Linear exited with status %s and no diagnostic.\n' "$lookup_status" >&2
      fi
      echo "  Check Linear CLI authentication and network access, then retry." >&2
      echo "  Expected issue ID format: REP-123. Run 'deliver --help' for usage." >&2
    fi
    return 1
  fi

  resolved_issue_id="$(printf '%s' "$issue_json" | jq -r '.item.identifier // empty' 2>/dev/null || true)"
  if [[ "$resolved_issue_id" != "$issue_id" ]]; then
    _err "Linear lookup for $issue_id returned an unexpected issue (${resolved_issue_id:-no issue identifier})."
    echo "  Verify the Linear response with 'linear issue show $issue_id --json'." >&2
    echo "  Expected issue ID format: REP-123. Run 'deliver --help' for usage." >&2
    return 1
  fi

  branch="$(printf '%s' "$issue_json" | jq -r '.item.branchName // .branchName // empty' 2>/dev/null || true)"
  title="$(printf '%s' "$issue_json" | jq -r '.item.title // .title // empty' 2>/dev/null || true)"
  delivery_command="$(_resolve_command_from_json "$issue_json")"

  printf '%s\n%s\n%s\n%s\n' "$issue_id" "${branch:-}" "${title:-}" "$delivery_command"
}

_mode_pr() {
  local pr_number="$1"

  if ! command -v gh >/dev/null 2>&1; then
    _err "gh CLI is required for PR mode."
    echo "  Install it: brew install gh" >&2
    return 1
  fi

  local pr_json
  pr_json="$(gh pr view "$pr_number" --json headRefName,body,title 2>/dev/null)" || {
    _err "Could not fetch PR #${pr_number}. Check that the PR exists and you are authenticated."
    return 1
  }

  local branch title body
  branch="$(printf '%s' "$pr_json" | jq -r '.headRefName // empty' 2>/dev/null || true)"
  title="$(printf '%s' "$pr_json" | jq -r '.title // empty' 2>/dev/null || true)"
  body="$(printf '%s' "$pr_json" | jq -r '.body // ""' 2>/dev/null || true)"

  # Extract Linear issue ID from branch name (preferred), PR body, then title.
  local issue_id=""
  if [[ "$branch" =~ [A-Z]+-[0-9]+ ]]; then
    issue_id="${BASH_REMATCH[0]}"
  elif [[ "$body" =~ [A-Z]+-[0-9]+ ]]; then
    issue_id="${BASH_REMATCH[0]}"
  elif [[ "$title" =~ [A-Z]+-[0-9]+ ]]; then
    issue_id="${BASH_REMATCH[0]}"
  fi

  printf '%s\n%s\n%s\n' "$issue_id" "$branch" "$title"

  if [[ -z "$issue_id" ]]; then
    _warn "No Linear issue ID found in PR #${pr_number} (checked branch name, body, and title)."
  fi
}

_mode_prompt() {
  local description="$1"
  local branch title

  # Generate kebab-case branch name from description
  branch="$(printf '%s' "$description" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//')"

  if [[ -z "$branch" ]]; then
    branch="scratch-$(date +%Y%m%d-%H%M%S)"
  fi

  # Generate Title Case workspace name
  title="$(printf '%s' "$description" | sed 's/[^a-zA-Z0-9 ]//g; s/  */ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')"

  printf '%s\n%s\n' "$branch" "$title"
}

_mode_bare_branch() {
  local branch_name="$1"

  # Validate branch name
  if ! git check-ref-format "refs/heads/$branch_name" >/dev/null 2>&1; then
    _err "'$branch_name' is not a valid branch name."
    echo "  Branch names must follow git ref format rules." >&2
    exit 1
  fi

  # Extract Linear ID from branch slug if present
  local issue_id=""
  if [[ "$branch_name" =~ [A-Z]+-[0-9]+ ]]; then
    issue_id="${BASH_REMATCH[0]}"
  fi

  printf '%s\n%s\n' "$issue_id" "$branch_name"
}

# ── Numeric env-knob sanitizer ─────────────────────────────────────
# Stage-4 poll/settle knobs must be non-negative integers. Garbage values
# (e.g. DELIVER_TUI_POLL_INTERVAL=abc) would otherwise kill the script via
# sleep/arithmetic under set -e after OpenCode has already launched. Empty
# or non-numeric values fall back to the default; 0 stays legal (tests use
# DELIVER_SUBMIT_SETTLE=0 to skip the settle sleep; 0 attempts legally
# skips a poll loop).
_deliver_numeric_or() {
  local value="${1:-}"
  local fallback="$2"
  if [[ -n "$value" && "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$fallback"
  fi
}

DELIVER_PR_FETCH_REF=""
DELIVER_PR_OWNER_TEMP=""
_deliver_cleanup_pr_fetch_ref() {
  if [[ -n "$DELIVER_PR_FETCH_REF" ]]; then
    if git -C "$REPO_ROOT" update-ref -d "$DELIVER_PR_FETCH_REF" >/dev/null 2>&1; then
      DELIVER_PR_FETCH_REF=""
    fi
  fi
  if [[ -n "$DELIVER_PR_OWNER_TEMP" ]]; then
    rm -f "$DELIVER_PR_OWNER_TEMP" >/dev/null 2>&1 || true
    DELIVER_PR_OWNER_TEMP=""
  fi
}

# Ownership is Git metadata, not a file in the user's worktree. A hard link
# installs the complete owner record atomically and fails rather than
# overwriting a competing PR's claim.
DELIVER_PR_OWNER_STATE=""
_deliver_pr_read_owner() {
  local wt_path="$1" pr_number="$2" git_dir owner_file owner_record
  DELIVER_PR_OWNER_STATE="invalid"

  git_dir="$(git -C "$wt_path" rev-parse --absolute-git-dir 2>/dev/null)" || return 0
  owner_file="$git_dir/deliver-pr-owner"
  if [[ -L "$owner_file" ]]; then
    return 0
  fi
  if [[ ! -e "$owner_file" ]]; then
    DELIVER_PR_OWNER_STATE="missing"
    return 0
  fi
  if [[ ! -f "$owner_file" || ! -r "$owner_file" ]]; then
    return 0
  fi

  owner_record="$(cat "$owner_file" 2>/dev/null)" || return 0
  if [[ ! "$owner_record" =~ ^pr=[0-9]+$ ]]; then
    return 0
  fi
  if [[ "${owner_record#pr=}" == "$pr_number" ]]; then
    DELIVER_PR_OWNER_STATE="owned"
  else
    DELIVER_PR_OWNER_STATE="foreign"
  fi
}

_deliver_pr_claim_owner() {
  local wt_path="$1" pr_number="$2" git_dir owner_file temp_file

  _deliver_pr_read_owner "$wt_path" "$pr_number"
  case "$DELIVER_PR_OWNER_STATE" in
    owned|foreign|invalid) return 0 ;;
    missing) ;;
  esac

  git_dir="$(git -C "$wt_path" rev-parse --absolute-git-dir 2>/dev/null)" || return 0
  owner_file="$git_dir/deliver-pr-owner"
  temp_file="$git_dir/deliver-pr-owner.$$.${RANDOM}.tmp"
  if ! (umask 077; set -C; printf 'pr=%s\n' "$pr_number" > "$temp_file"); then
    # No-clobber creation can fail because a similarly named temporary file
    # already exists; never remove a file we did not create.
    DELIVER_PR_OWNER_STATE="invalid"
    return 0
  fi
  DELIVER_PR_OWNER_TEMP="$temp_file"

  if ln "$temp_file" "$owner_file" 2>/dev/null; then
    rm -f "$temp_file" >/dev/null 2>&1 || true
    DELIVER_PR_OWNER_TEMP=""
    DELIVER_PR_OWNER_STATE="owned"
    return 0
  fi

  rm -f "$temp_file" >/dev/null 2>&1 || true
  DELIVER_PR_OWNER_TEMP=""
  _deliver_pr_read_owner "$wt_path" "$pr_number"
}

_deliver_pr_is_isolated() {
  local wt_path="$1" worktree_real main_real
  worktree_real="$(cd "$wt_path" 2>/dev/null && pwd -P)" || return 1
  main_real="$(cd "$MAIN_CHECKOUT" 2>/dev/null && pwd -P)" || return 1
  [[ "$worktree_real" != "$main_real" ]]
}

# Verify the requested branch/ref, exact fetched OID, isolated path, and PR
# owner. Legacy worktrees may be claimed only after the other checks pass.
# Return 0 for current-PR ownership, 2 for foreign ownership, 3 for an
# unclaimed race winner that has not published its owner record yet, 1 unsafe.
_deliver_pr_verify_worktree() {
  local wt_path="$1" branch="$2" pr_head="$3" pr_number="$4" claim_legacy="$5"
  local current_branch branch_oid worktree_head

  _deliver_pr_read_owner "$wt_path" "$pr_number"
  case "$DELIVER_PR_OWNER_STATE" in
    foreign) return 2 ;;
    invalid) return 1 ;;
    missing)
      if [[ "$claim_legacy" != true ]]; then
        return 3
      fi
      ;;
    owned) ;;
    *) return 1 ;;
  esac

  _deliver_pr_is_isolated "$wt_path" || return 1
  current_branch="$(git -C "$wt_path" branch --show-current 2>/dev/null)" || return 1
  [[ "$current_branch" == "$branch" ]] || return 1
  branch_oid="$(git -C "$REPO_ROOT" rev-parse --verify "refs/heads/$branch" 2>/dev/null)" || return 1
  worktree_head="$(git -C "$wt_path" rev-parse --verify HEAD 2>/dev/null)" || return 1
  [[ "$branch_oid" == "$pr_head" && "$worktree_head" == "$pr_head" ]] || return 1

  if [[ "$DELIVER_PR_OWNER_STATE" == missing ]]; then
    _deliver_pr_claim_owner "$wt_path" "$pr_number"
    case "$DELIVER_PR_OWNER_STATE" in
      owned) return 0 ;;
      foreign) return 2 ;;
      *) return 1 ;;
    esac
  fi
  return 0
}

DELIVER_PR_RECOVERED_WT=""
_deliver_pr_recover_source_worktree() {
  local branch="$1" pr_head="$2" pr_number="$3"
  local raced_wt current_branch branch_oid worktree_head attempts verify_status
  DELIVER_PR_RECOVERED_WT=""
  attempts=0

  while [[ "$attempts" -lt 200 ]]; do
    raced_wt="$(_worktree_path_for_branch "$branch" "$REPO_ROOT" 2>/dev/null || true)"
    if [[ -n "$raced_wt" ]]; then
      _deliver_pr_is_isolated "$raced_wt" || return 1
      _deliver_pr_read_owner "$raced_wt" "$pr_number"
      case "$DELIVER_PR_OWNER_STATE" in
        foreign) return 2 ;;
        invalid) return 1 ;;
        owned)
          if _deliver_pr_verify_worktree "$raced_wt" "$branch" "$pr_head" "$pr_number" false; then
            DELIVER_PR_RECOVERED_WT="$raced_wt"
            return 0
          else
            verify_status=$?
            [[ "$verify_status" == 2 ]] && return 2
            return 1
          fi
          ;;
        missing)
          current_branch="$(git -C "$raced_wt" branch --show-current 2>/dev/null)" || return 1
          branch_oid="$(git -C "$REPO_ROOT" rev-parse --verify "refs/heads/$branch" 2>/dev/null)" || return 1
          worktree_head="$(git -C "$raced_wt" rev-parse --verify HEAD 2>/dev/null)" || return 1
          if [[ "$current_branch" != "$branch" || "$branch_oid" != "$pr_head" || "$worktree_head" != "$pr_head" ]]; then
            return 1
          fi
          ;;
      esac
    fi
    sleep 0.01
    attempts=$((attempts + 1))
  done
  return 1
}

_deliver_pr_alias_source_suffix() {
  local source_branch="$1" branch_slug hash_output digest
  branch_slug="$(slugify "$source_branch" | cut -c 1-120)"
  [[ -n "$branch_slug" ]] || return 1
  hash_output="$(printf '%s' "$source_branch" | shasum -a 256 2>/dev/null)" || return 1
  digest="${hash_output%% *}"
  [[ "$digest" =~ ^[[:xdigit:]]{64}$ ]] || return 1
  printf '%s-%s\n' "$branch_slug" "$digest"
}

_deliver_pr_alias_branch() {
  local pr_number="$1" source_branch="$2" source_suffix
  source_suffix="$(_deliver_pr_alias_source_suffix "$source_branch")" || return 1
  printf 'deliver/pr-%s/%s\n' "$pr_number" "$source_suffix"
}

DELIVER_PR_SOURCE_LOCK_PATH=""
DELIVER_PR_SOURCE_LOCK_IDENTITY=""
DELIVER_PR_SOURCE_SETUP_STATE=""

_deliver_pr_inspect_source_worktree_setup() {
  local expected_branch="$1" target_path="$2" wt_path="$3" branch="$4" initializing="$5"
  local git_dir source_suffix alias_remainder alias_pr_number alias_source_suffix relevant=false

  if [[ "$wt_path" == "$target_path" || "$branch" == "$expected_branch" ]]; then
    relevant=true
  elif [[ "$branch" == deliver/pr-* ]]; then
    source_suffix="$(_deliver_pr_alias_source_suffix "$expected_branch")" || {
      DELIVER_PR_SOURCE_SETUP_STATE="unverifiable"
      return 0
    }
    alias_remainder="${branch#deliver/pr-}"
    alias_pr_number="${alias_remainder%%/*}"
    alias_source_suffix="${alias_remainder#*/}"
    if [[ "$alias_pr_number" =~ ^[0-9]+$ && "$alias_source_suffix" == "$source_suffix" ]]; then
      relevant=true
    fi
  fi

  # Filter by branch/path identity before trusting initializing markers or
  # private index locks; unrelated Git worktree operations must not serialize
  # an independent PR delivery.
  [[ "$relevant" == true ]] || return 0

  if [[ "$initializing" == true ]]; then
    DELIVER_PR_SOURCE_SETUP_STATE="in_progress"
    return 0
  fi

  git_dir="$(git -C "$wt_path" rev-parse --absolute-git-dir 2>/dev/null)" || {
    DELIVER_PR_SOURCE_SETUP_STATE="unverifiable"
    return 0
  }
  if [[ "$git_dir" != /* || "$git_dir" == *$'\n'* || ! -d "$git_dir" ]]; then
    DELIVER_PR_SOURCE_SETUP_STATE="unverifiable"
    return 0
  fi

  if [[ -e "$git_dir/index.lock" || -L "$git_dir/index.lock" ]]; then
    DELIVER_PR_SOURCE_SETUP_STATE="in_progress"
  fi
}

_deliver_pr_source_worktree_setup_state() {
  local expected_branch="$1" target_path="$2"
  local worktree_list line entry_path="" entry_branch="" entry_initializing=false
  DELIVER_PR_SOURCE_SETUP_STATE="clear"

  worktree_list="$(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null)" || {
    DELIVER_PR_SOURCE_SETUP_STATE="unverifiable"
    return 0
  }

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      worktree\ *)
        if [[ -n "$entry_path" ]]; then
          _deliver_pr_inspect_source_worktree_setup \
            "$expected_branch" "$target_path" "$entry_path" "$entry_branch" "$entry_initializing"
          case "$DELIVER_PR_SOURCE_SETUP_STATE" in
            in_progress|unverifiable) return 0 ;;
          esac
        fi
        entry_path="${line#worktree }"
        entry_branch=""
        entry_initializing=false
        ;;
      branch\ refs/heads/*)
        entry_branch="${line#branch refs/heads/}"
        ;;
      locked\ initializing)
        entry_initializing=true
        ;;
      "")
        if [[ -n "$entry_path" ]]; then
          _deliver_pr_inspect_source_worktree_setup \
            "$expected_branch" "$target_path" "$entry_path" "$entry_branch" "$entry_initializing"
          case "$DELIVER_PR_SOURCE_SETUP_STATE" in
            in_progress|unverifiable) return 0 ;;
          esac
          entry_path=""
          entry_branch=""
          entry_initializing=false
        fi
        ;;
    esac
  done <<< "$worktree_list"

  if [[ -n "$entry_path" ]]; then
    _deliver_pr_inspect_source_worktree_setup \
      "$expected_branch" "$target_path" "$entry_path" "$entry_branch" "$entry_initializing"
  fi
}

# Stale source-lock recovery only proves that the delivery shell died; Git may
# still be populating a source or PR-alias worktree in a child process. Wait
# while Git exposes an initializing marker or the relevant private index.lock.
_deliver_pr_wait_for_source_worktree_setup() {
  local branch="$1" target_path="$2" attempts=0 max_attempts=1200

  while [[ "$attempts" -lt "$max_attempts" ]]; do
    _deliver_pr_source_worktree_setup_state "$branch" "$target_path"
    case "$DELIVER_PR_SOURCE_SETUP_STATE" in
      clear) return 0 ;;
      in_progress) ;;
      *)
        _err "Cannot safely verify whether Git is still setting up the PR worktree for source branch '$branch'."
        return 1
        ;;
    esac
    sleep 0.05
    attempts=$((attempts + 1))
  done

  _err "Timed out waiting for Git to finish setting up the PR worktree for source branch '$branch'."
  return 1
}

# Reuse the atomic owner-record lock machinery from worktree.sh, but give PR
# source branches a separate namespace in shared Git metadata. Linked worktrees
# resolve to the same common dir, so every deliver invocation for this source
# branch contends on the same lock regardless of its checkout path.
_deliver_pr_acquire_source_branch_lock() {
  local branch="$1" git_common_dir lock_root hash_output digest
  DELIVER_PR_SOURCE_LOCK_PATH=""
  DELIVER_PR_SOURCE_LOCK_IDENTITY=""

  git_common_dir="$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null)" || return 1
  case "$git_common_dir" in
    /*) ;;
    *) git_common_dir="$REPO_ROOT/$git_common_dir" ;;
  esac
  git_common_dir="$(cd "$git_common_dir" 2>/dev/null && pwd -P)" || return 1
  if [[ "$git_common_dir" == *$'\n'* || "$branch" == *$'\n'* ]]; then
    _err "Cannot derive a safe PR source-branch lock identity for '$branch'."
    return 1
  fi

  hash_output="$(printf '%s\n%s\n' "$git_common_dir" "$branch" | shasum -a 256 2>/dev/null)" || return 1
  digest="${hash_output%% *}"
  if [[ ! "$digest" =~ ^[[:xdigit:]]{64}$ ]]; then
    _err "Cannot verify PR source-branch lock identity for '$branch'."
    return 1
  fi

  lock_root="$git_common_dir/deliver-pr-branch-locks"
  mkdir -p "$lock_root" || {
    _err "Cannot create PR source-branch lock directory: $lock_root"
    return 1
  }
  DELIVER_PR_SOURCE_LOCK_PATH="$lock_root/$digest.lock"
  DELIVER_PR_SOURCE_LOCK_IDENTITY="source-branch:$git_common_dir:$branch"

  # This lock spans worktree discovery and complete checkout/owner publication.
  # Install the existing cleanup chain before acquisition: its EXIT handler
  # releases this lock, restores the prior traps, then lets the invocation's
  # fetch-ref cleanup run unchanged on errors and signals.
  _herdr_install_lock_cleanup_traps
  if ! _herdr_acquire_workspace_lock "$DELIVER_PR_SOURCE_LOCK_PATH" "$DELIVER_PR_SOURCE_LOCK_IDENTITY"; then
    _herdr_restore_lock_cleanup_traps
    DELIVER_PR_SOURCE_LOCK_PATH=""
    DELIVER_PR_SOURCE_LOCK_IDENTITY=""
    return 1
  fi
  return 0
}

_deliver_pr_release_source_branch_lock() {
  if [[ -z "$DELIVER_PR_SOURCE_LOCK_PATH" || -z "$DELIVER_PR_SOURCE_LOCK_IDENTITY" ]]; then
    _err "PR source-branch lock state is missing during release."
    return 1
  fi
  if ! _herdr_release_workspace_lock "$DELIVER_PR_SOURCE_LOCK_PATH" "$HERDR_LOCK_ACTIVE_TOKEN" "$DELIVER_PR_SOURCE_LOCK_IDENTITY"; then
    return 1
  fi
  _herdr_restore_lock_cleanup_traps
  DELIVER_PR_SOURCE_LOCK_PATH=""
  DELIVER_PR_SOURCE_LOCK_IDENTITY=""
  return 0
}

_deliver_pr_alias_worktree() {
  local pr_number="$1" source_branch="$2" pr_head="$3" wt_path="$4"
  local alias_branch alias_oid alias_wt verify_status attempts

  alias_branch="$(_deliver_pr_alias_branch "$pr_number" "$source_branch")" || {
    _err "Could not derive a valid local alias branch for PR #${pr_number}."
    return 1
  }
  if ! git check-ref-format "refs/heads/$alias_branch" >/dev/null 2>&1; then
    _err "Could not derive a valid local alias branch for PR #${pr_number}."
    return 1
  fi

  alias_wt="$(_worktree_path_for_branch "$alias_branch" "$REPO_ROOT" 2>/dev/null || true)"
  if [[ -n "$alias_wt" ]]; then
    if _deliver_pr_verify_worktree "$alias_wt" "$alias_branch" "$pr_head" "$pr_number" true; then
      printf '%s\n' "$alias_wt"
      return 0
    fi
    _err "Existing alias worktree for PR #${pr_number} is not owned by that PR at the fetched head."
    return 1
  fi

  alias_oid="$(git rev-parse --verify --quiet "refs/heads/$alias_branch" 2>/dev/null || true)"
  if [[ -n "$alias_oid" && "$alias_oid" != "$pr_head" ]]; then
    _err "Local alias branch '$alias_branch' does not match fetched PR #${pr_number} head."
    return 1
  fi

  if [[ -n "$alias_oid" ]]; then
    if git worktree add "$wt_path" "$alias_branch" >/dev/null 2>&1; then
      if _deliver_pr_verify_worktree "$wt_path" "$alias_branch" "$pr_head" "$pr_number" true; then
        printf '%s\n' "$wt_path"
        return 0
      fi
      _err "Could not verify the local alias worktree for PR #${pr_number}."
      return 1
    fi
  else
    if git worktree add -b "$alias_branch" "$wt_path" "$pr_head" >/dev/null 2>&1; then
      if _deliver_pr_verify_worktree "$wt_path" "$alias_branch" "$pr_head" "$pr_number" true; then
        printf '%s\n' "$wt_path"
        return 0
      fi
      _err "Could not verify the local alias worktree for PR #${pr_number}."
      return 1
    fi
  fi

  # A same-PR invocation can win the alias creation race. Reuse it only after
  # its branch/ref, HEAD, isolation, and Git-dir ownership all validate.
  attempts=0
  while [[ "$attempts" -lt 100 ]]; do
    alias_wt="$(_worktree_path_for_branch "$alias_branch" "$REPO_ROOT" 2>/dev/null || true)"
    if [[ -n "$alias_wt" ]]; then
      if _deliver_pr_verify_worktree "$alias_wt" "$alias_branch" "$pr_head" "$pr_number" true; then
        printf '%s\n' "$alias_wt"
        return 0
      else
        verify_status=$?
      fi
      if [[ "$verify_status" != 3 ]]; then
        break
      fi
    fi
    sleep 0.01
    attempts=$((attempts + 1))
  done
  _err "Could not create or safely adopt a local alias worktree for PR #${pr_number}."
  return 1
}

# ── Worktree creation and agent launch ─────────────────────────────
_create_worktree_and_launch() {
  local mode="$1"
  local issue_id="$2"
  local branch="$3"
  local slug="$4"
  local label="$5"
  local delivery_command="$6"
  local profile_arg="${7:-}"
  local nightshift="${8:-false}"
  local dry_run="${9:-false}"
  local mode_arg="${10:-}"
  local issue_title="${11:-}"

  local wt_path prompt_arg
  wt_path="$(worktree_path "$slug")"

  # Build prompt argument: command + optional issue ID
  if [[ -n "${issue_id:-}" ]]; then
    prompt_arg="$delivery_command $issue_id"
  else
    prompt_arg="$delivery_command"
  fi

  echo ""

  if [[ "$dry_run" == "true" ]]; then
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Mode: ${mode}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Branch: ${branch}"
    # Issue mode surfaces the adopt-vs-create decision (read-only resolver)
    # instead of the bare slug path — reproctl appends a mint suffix to the
    # slug, and on adopt the resolver supplies the real existing path.
    local existing_decision=""
    if [[ "$mode" == "issue_id" ]]; then
      existing_decision="$(_resolve_existing_issue_worktree "$issue_id" "$branch" 2>/dev/null)" || existing_decision="create"
    fi
    case "$existing_decision" in
      "adopt "*)
        local existing_branch="${existing_decision#adopt }"
        local existing_wt="${existing_branch#* }"
        existing_branch="${existing_branch%% *}"
        echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Found existing worktree at ${existing_wt} (branch ${existing_branch}) — will resume"
        ;;
      "reattach "*)
        echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Found existing branch ${existing_decision#reattach } without a worktree — will attach a worktree to it"
        ;;
      *)
        if [[ "$mode" == "issue_id" ]]; then
          echo "  ${CLR_DIM}[dry-run]${CLR_RESET} No existing worktree for ${issue_id} — will create"
        else
          echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Worktree path: ${wt_path}"
        fi
        ;;
    esac
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Workspace label: ${label}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Command: ${delivery_command}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Profile: ${profile_arg:-default}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Nightshift: ${nightshift}"
    echo ""
    echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
    return 0
  fi

  _step 1 4 "Creating worktree for branch: ${CLR_BOLD}${branch}${CLR_RESET}"

  # Stage 1: Worktree creation
  if [[ "$mode" == "issue_id" ]]; then
    # Use reproctl for full issue workflow (fetch from Linear, branch creation, etc.)
    # Note: --open is deliberately omitted; herdr workspace is handled via sibling workspace below
    # Capture reproctl output to extract the actual worktree path (avoids git worktree list race).
    # --skip-install defers pnpm install + moon run :build; pnpm install is
    # re-sent to the terminal pane after the workspace layout (see Stage 3).
    local reproctl_output
    reproctl_output="$("$SCRIPT_DIR/reproctl.sh" wt create --from-issue "$issue_id" --skip-install --no-status-update 2>&1)"
    printf '%s\n' "$reproctl_output"

    # Extract the actual worktree path from reproctl's output
    local resolved_wt_path
    resolved_wt_path="$(printf '%s' "$reproctl_output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
    if [[ -z "$resolved_wt_path" ]]; then
      # Fallback: scan git worktree list if reproctl output didn't contain a path
      resolved_wt_path="$(_worktree_path_for_branch "$branch")"
      if [[ -z "$resolved_wt_path" ]]; then
        local branch_pattern
        if [[ -n "$branch" ]]; then
          branch_pattern="${branch}-*"
        else
          branch_pattern="*-$(printf '%s' "$issue_id" | tr '[:upper:]' '[:lower:]')-*"
        fi
        local wt_entry_dir="" wt_entry_branch="" latest_wt=""
        while IFS= read -r line; do
          case "$line" in
            worktree\ *) wt_entry_dir="${line#worktree }" ;;
            branch\ *)   wt_entry_branch="${line#branch }"; wt_entry_branch="${wt_entry_branch#refs/heads/}" ;;
            "")
              if [[ -n "$wt_entry_branch" ]]; then
                if [[ -n "$branch" ]] && [[ "$wt_entry_branch" == "$branch_pattern" ]]; then
                  resolved_wt_path="$wt_entry_dir"
                elif [[ -z "$branch" ]]; then
                  local lower_branch
                  lower_branch="$(printf '%s' "$wt_entry_branch" | tr '[:upper:]' '[:lower:]')"
                  local lower_pattern
                  lower_pattern="$(printf '%s' "$issue_id" | tr '[:upper:]' '[:lower:]')"
                  if [[ "$lower_branch" == *"$lower_pattern"* ]]; then
                    latest_wt="$wt_entry_dir"
                  fi
                fi
              fi
              wt_entry_dir="" wt_entry_branch=""
              ;;
          esac
        done < <(git worktree list --porcelain)
        if [[ -z "$resolved_wt_path" && -n "$latest_wt" ]]; then
          resolved_wt_path="$latest_wt"
        fi
      fi
    fi
    if [[ -n "$resolved_wt_path" ]]; then
      wt_path="$resolved_wt_path"
    fi
  elif [[ "$mode" == "pr" ]]; then
    # Keep each invocation's PR head in a private ref: FETCH_HEAD is shared by
    # processes using this checkout and can be replaced by another fetch.
    local pr_fetch_ref="refs/deliver/pr/${mode_arg}/$$-${RANDOM}"
    DELIVER_PR_FETCH_REF="$pr_fetch_ref"
    trap _deliver_cleanup_pr_fetch_ref EXIT
    git fetch origin "pull/${mode_arg}/head:${pr_fetch_ref}" 2>/dev/null || {
      _err "Could not fetch PR #${mode_arg}. The branch may have been deleted."
      echo "  Try: git fetch origin pull/${mode_arg}/head" >&2
      exit 1
    }

    local pr_head local_branch_commit attached_wt="" existing_alias_wt="" expected_alias_branch=""
    local owner_state="" verify_status=0 recover_status=0 push_pr_source_branch=false
    pr_head="$(git rev-parse --verify "${pr_fetch_ref}^{commit}" 2>/dev/null)" || {
      _err "Could not resolve the fetched head for PR #${mode_arg}."
      exit 1
    }

    # Serialize discovery, legacy ownership claims, and all source/alias
    # worktree creation in the common Git directory. The scan below must be
    # performed only after lock acquisition; a registered worktree may still
    # be in its checkout phase until its creating git process returns.
    if ! _deliver_pr_acquire_source_branch_lock "$branch"; then
      _err "Could not safely acquire the shared source-branch lock for PR #${mode_arg} on '$branch'."
      exit 1
    fi
    if ! _deliver_pr_wait_for_source_worktree_setup "$branch" "$wt_path"; then
      _err "Could not safely adopt PR #${mode_arg} worktree for source branch '$branch'."
      exit 1
    fi

    local_branch_commit="$(git rev-parse --verify --quiet "refs/heads/$branch" 2>/dev/null || true)"

    # Never mutate an adopted worktree. Ownership in its Git directory keeps
    # different PRs from treating one source-branch checkout as shared state.
    attached_wt="$(_worktree_path_for_branch "$branch" "$REPO_ROOT" 2>/dev/null || true)"
    if [[ -z "$attached_wt" ]]; then
      # A prior delivery may have moved this PR onto its local alias because
      # another PR owned the source checkout. Reuse only that expected alias;
      # otherwise the source branch's occupied PR path would be mistaken for
      # a fresh worktree target after its original checkout is removed.
      expected_alias_branch="$(_deliver_pr_alias_branch "$mode_arg" "$branch")" || {
        _err "Could not derive the expected local alias branch for PR #${mode_arg}."
        exit 1
      }
      existing_alias_wt="$(_worktree_path_for_branch "$expected_alias_branch" "$REPO_ROOT" 2>/dev/null || true)"
      if [[ -n "$existing_alias_wt" ]]; then
        if [[ "$existing_alias_wt" != "$wt_path" ]] \
          || ! _deliver_pr_verify_worktree "$existing_alias_wt" "$expected_alias_branch" "$pr_head" "$mode_arg" false; then
          _err "Existing alias worktree for PR #${mode_arg} is not owned by that PR at the fetched head and expected path."
          exit 1
        fi
        wt_path="$existing_alias_wt"
      fi
    fi

    if [[ -n "$existing_alias_wt" ]]; then
      : # The expected alias was verified above; leave its contents untouched.
    elif [[ -n "$attached_wt" ]]; then
      if ! _deliver_pr_is_isolated "$attached_wt"; then
        _err "PR branch '$branch' is checked out in the primary checkout ($MAIN_CHECKOUT) or its worktree path cannot be verified; PR delivery requires an isolated worktree."
        exit 1
      fi

      _deliver_pr_read_owner "$attached_wt" "$mode_arg"
      owner_state="$DELIVER_PR_OWNER_STATE"
      case "$owner_state" in
        invalid)
          _err "Could not verify PR ownership metadata for the worktree on branch '$branch'."
          exit 1
          ;;
        foreign)
          # Another PR owns this branch checkout. Keep it untouched and use a
          # PR-scoped local alias at this invocation's fetched commit.
          wt_path="$(_deliver_pr_alias_worktree "$mode_arg" "$branch" "$pr_head" "$wt_path")" || exit 1
          ;;
        owned|missing)
          if _deliver_pr_verify_worktree "$attached_wt" "$branch" "$pr_head" "$mode_arg" true; then
            wt_path="$attached_wt"
          else
            verify_status=$?
            if [[ "$verify_status" == 2 ]]; then
              wt_path="$(_deliver_pr_alias_worktree "$mode_arg" "$branch" "$pr_head" "$wt_path")" || exit 1
            else
              _err "Local PR worktree for branch '$branch' does not match fetched PR #${mode_arg} head or ownership."
              exit 1
            fi
          fi
          ;;
      esac
    elif [[ -n "$local_branch_commit" ]]; then
      if [[ "$local_branch_commit" != "$pr_head" ]]; then
        _err "Local PR branch '$branch' does not match fetched PR #${mode_arg} head."
        exit 1
      fi

      if git worktree add "$wt_path" "$branch"; then
        if ! _deliver_pr_verify_worktree "$wt_path" "$branch" "$pr_head" "$mode_arg" true; then
          _err "Could not verify PR #${mode_arg} ownership and exact head after attaching branch '$branch'."
          exit 1
        fi
      else
        if _deliver_pr_recover_source_worktree "$branch" "$pr_head" "$mode_arg"; then
          wt_path="$DELIVER_PR_RECOVERED_WT"
        else
          recover_status=$?
          if [[ "$recover_status" == 2 ]]; then
            wt_path="$(_deliver_pr_alias_worktree "$mode_arg" "$branch" "$pr_head" "$wt_path")" || exit 1
          else
            _err "Could not attach or safely adopt local PR branch '$branch' for PR #${mode_arg}."
            exit 1
          fi
        fi
      fi
    else
      # Create the fresh source branch and worktree together. Only this
      # successful source-branch creation keeps the historical push behavior.
      if git worktree add -b "$branch" "$wt_path" "$pr_head"; then
        if ! _deliver_pr_verify_worktree "$wt_path" "$branch" "$pr_head" "$mode_arg" true; then
          _err "Could not verify fresh PR #${mode_arg} worktree ownership and head."
          exit 1
        fi
        push_pr_source_branch=true
      else
        if _deliver_pr_recover_source_worktree "$branch" "$pr_head" "$mode_arg"; then
          wt_path="$DELIVER_PR_RECOVERED_WT"
        else
          recover_status=$?
          if [[ "$recover_status" == 2 ]]; then
            wt_path="$(_deliver_pr_alias_worktree "$mode_arg" "$branch" "$pr_head" "$wt_path")" || exit 1
          else
            _err "Could not create or safely adopt a worktree for PR #${mode_arg} on branch '$branch'."
            exit 1
          fi
        fi
      fi
    fi

    if ! _deliver_pr_release_source_branch_lock; then
      _err "Could not safely release the shared source-branch lock for PR #${mode_arg} on '$branch'."
      exit 1
    fi
    if [[ "$push_pr_source_branch" == true ]]; then
      # Preserve the historic best-effort push, but do not hold the shared
      # source-branch lock over a network operation after ownership is durable.
      git push -u origin "$branch" 2>/dev/null || true
    fi
    _deliver_cleanup_pr_fetch_ref
  elif [[ "$mode" == "bare_branch" ]]; then
    # Bare branch mode — checkout existing branch or create from HEAD
    if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
      git worktree add "$wt_path" "$branch"
    else
      git worktree add -b "$branch" "$wt_path"
    fi
    git push -u origin "$branch" 2>/dev/null || true
  else
    # Prompt mode — create new branch from latest main
    local start_ref=""
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch origin main >/dev/null 2>&1 || true
      if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null 2>&1; then
        start_ref="refs/remotes/origin/main"
      fi
    fi
    if [[ -z "$start_ref" ]] && git rev-parse --verify --quiet refs/heads/main >/dev/null 2>&1; then
      start_ref="refs/heads/main"
    fi
    git worktree add -b "$branch" "$wt_path" "${start_ref:-HEAD}"
    git push -u origin "$branch" 2>/dev/null || true
  fi

  _ok "Worktree created at: ${wt_path}"

  # Stage 2: Sibling workspace via herdr
  _step 2 4 "Adding herdr sibling workspace..."
  local ws_id
  if ! _herdr_workspace_add_sibling "$wt_path" "$label" "$issue_title"; then
    _err "Could not safely acquire or release the Herdr workspace lock for PR/worktree delivery."
    exit 1
  fi
  ws_id="$HERDR_WORKSPACE_ID"

  if [[ -z "$ws_id" ]]; then
    _warn "Could not open herdr workspace — worktree created but no OpenCode session was opened."
    echo "  See errors above for the specific reason."
    echo ""
    # Worktree creation skipped pnpm install (--skip-install) and there is no
    # herdr pane to defer it to — install synchronously so the worktree is
    # usable. Non-fatal: an install failure must not change the return behavior.
    (cd "$wt_path" && pnpm install) || true
    echo ""
    echo "  cd $wt_path"
    echo "  opencode2 --prompt \"$prompt_arg\""
    echo "  After the TUI opens, press Enter in it to kick off the build (--prompt seeds the editor but does not submit)."
    return 0
  fi
  _ok "Workspace: ${label} (${ws_id})"

  # Stage 3: Workspace layout
  #   ┌─────────────────────┬──────────┐
  #   │                     │          │
  #   │   opencode (70%)    │ terminal │
  #   │                     │ (30%)    │
  #   └─────────────────────┴──────────┘
  # Worktree is already bootstrapped by reproctl.sh wt create.
  _step 3 4 "Setting up workspace layout..."
  local root_pane_id
  root_pane_id="$(herdr_project_cmd pane list --workspace "$ws_id" 2>/dev/null | jq -r '.result.panes[0].pane_id // .result.panes[0].id // empty' 2>/dev/null || true)"
  if [[ -z "$root_pane_id" || "$root_pane_id" == "null" ]]; then
    _warn "Could not find a pane for the workspace — agent launch skipped."
    # No pane at all to defer pnpm install to — install synchronously so the
    # worktree is usable (same contract as the herdr-down fallback above).
    (cd "$wt_path" && pnpm install) || true
    return 0
  fi

  # Split root (left 100%) → opencode 70% left + terminal 30% right.
  # Note: herdr's --ratio sizes the split node's FIRST (original) pane, so 0.7
  # sizes opencode at 70% left and leaves the new right pane (terminal) at 30%.
  local right_split_result right_pane_id opencode_pane_id term_pane_id
  right_split_result="$(herdr_project_cmd pane split --pane "$root_pane_id" --direction right --cwd "$wt_path" --ratio 0.7 --no-focus 2>&1)" || true
  right_pane_id="$(printf '%s' "$right_split_result" | jq -r '.result.pane.pane_id // .result.pane_id // empty' 2>/dev/null || true)"
  if [[ -z "$right_pane_id" || "$right_pane_id" == "null" ]]; then
    _warn "Pane split failed — falling back to single-pane layout."
    opencode_pane_id="$root_pane_id"
    # No terminal pane to defer pnpm install to — install synchronously so the
    # worktree is usable (same contract as the herdr-down fallback above).
    (cd "$wt_path" && pnpm install) || true
  else
    opencode_pane_id="$root_pane_id"
    term_pane_id="$right_pane_id"
    _ok "Layout: opencode (${opencode_pane_id}) | terminal (${term_pane_id})"
  fi

  # Deferred install: worktree creation skipped pnpm install via --skip-install
  # (issue_id mode) or never ran it (PR/bare-branch/prompt modes), so send it
  # to the terminal pane now, fire-and-forget.
  if [[ -n "${term_pane_id:-}" ]]; then
    herdr_project_cmd pane run "$term_pane_id" "cd \"$wt_path\" && pnpm install" 2>/dev/null || true
  fi

  # Stage 4: Agent launch in the opencode pane
  _step 4 4 "Launching OpenCode agent..."

  # Build the opencode launch command (OpenCode v2 via `reproctl opencode` → opencode2).
  local opencode_cmd
  if [[ -n "$profile_arg" ]]; then
    opencode_cmd="CALLER_PWD=\"$wt_path\" \"$SCRIPT_DIR/reproctl.sh\" opencode --profile \"$profile_arg\" --prompt \"$prompt_arg\""
  else
    opencode_cmd="CALLER_PWD=\"$wt_path\" REPRO_OPENCODE_PROFILE=\"${REPRO_OPENCODE_PROFILE:-opencode-go-glm-5.3-flash-only}\" \"$SCRIPT_DIR/reproctl.sh\" opencode --prompt \"$prompt_arg\""
  fi
  if [[ "$nightshift" == "true" ]]; then
    # v2 has no --permission-mode/--disallowed-tools; --auto approves everything not explicitly denied.
    opencode_cmd="$opencode_cmd --auto"
  fi

  # Launch OpenCode v2 by typing the command into the pane shell. Do NOT use
  # `herdr agent start --kind opencode` here: in herdr 0.7.5 that kind's
  # canonical executable is the v1 `opencode` binary, which races this v2
  # launch in the same pane (v1 wins, the prompt is lost, the session sits idle).
  herdr_project_cmd pane run "$opencode_pane_id" "cd \"$wt_path\" && $opencode_cmd" || {
    _warn "Failed to send OpenCode launch command to pane ${opencode_pane_id}."
    return 0
  }

  # Wait for the v2 TUI to render AND seed the editor, then submit. The poll
  # budget is env-tunable for tests; the defaults preserve the historical
  # 30 × 2s = 60s window.
  local poll tui_detected=false pane_visible
  local tui_poll_attempts
  tui_poll_attempts="$(_deliver_numeric_or "${DELIVER_TUI_POLL_ATTEMPTS:-}" 30)"
  local tui_poll_interval
  tui_poll_interval="$(_deliver_numeric_or "${DELIVER_TUI_POLL_INTERVAL:-}" 2)"
  for poll in $(seq 1 "$tui_poll_attempts"); do
    # TUI-rendered-and-seeded signal: the seeded prompt is visible in the live
    # viewport WITHOUT the launch wrapper. Before the TUI takes over, the pane
    # shows the `herdr pane run` echo, which contains the prompt text but ALSO
    # the `--prompt` flag — the negative check excludes that pre-render state.
    # (Do NOT grep for 'beta-': worktree slugs and profile names can put it in
    # the echo, which would submit Enter before the TUI exists.)
    # Join the capture before matching: panes hard-wrap at their width, and a
    # wrap boundary inside either matched token (the seed, or `--prompt`)
    # would split it across rows and corrupt the check. Deleting the row
    # separators reconstructs the logical stream (a hard-wrap inserts no
    # character). Residual risk: on pathologically short panes the echo's
    # head (with `--prompt`) can scroll out of the visible viewport while its
    # tail (seed) remains — bounded consequence, lands in the graceful
    # could-not-confirm path.
    pane_visible="$(herdr_project_cmd pane read --source visible "$opencode_pane_id" 2>/dev/null | tr -d '\r\n' || true)"
    if grep -qF -- "$prompt_arg" <<<"$pane_visible" && ! grep -qF -- '--prompt' <<<"$pane_visible"; then
      tui_detected=true
      break
    fi
    sleep "$tui_poll_interval"
  done
  if [[ "$tui_detected" != "true" ]]; then
    _warn "OpenCode v2 seeded TUI not detected in pane ${opencode_pane_id} within $((tui_poll_attempts * tui_poll_interval))s."
    echo "  Check the pane; if it did not start, run: cd \"$wt_path\" && $opencode_cmd"
    return 0
  fi

  # --prompt only seeds the opencode2 editor; it never submits. Give the TUI
  # a moment to finish mounting with the seeded editor, then send Enter to
  # kick off the build. Do NOT use `herdr agent prompt` here — it re-types
  # the command and would duplicate the seeded editor text. If the submit
  # fails, the seeded prompt stays intact for a manual Enter.
  sleep "$(_deliver_numeric_or "${DELIVER_SUBMIT_SETTLE:-}" 2)"
  if ! herdr_project_cmd pane send-keys "$opencode_pane_id" enter >/dev/null 2>&1; then
    _warn "Could not submit the seeded build prompt in pane ${opencode_pane_id} (herdr pane send-keys failed — herdr may not accept key events for this pane)."
    echo "  The prompt is seeded but not submitted: press Enter in the pane to kick off the build."
    return 0
  fi

  # Confirm the kick-off by polling herdr's agent classification for the
  # opencode pane (same `herdr pane list` source the pane IDs came from). If
  # classification lags we warn conservatively: a false "could not confirm"
  # is harmless, the user just sees the build already running.
  local state_poll state_confirmed=false
  local state_poll_attempts
  state_poll_attempts="$(_deliver_numeric_or "${DELIVER_STATE_POLL_ATTEMPTS:-}" 10)"
  local state_poll_interval
  state_poll_interval="$(_deliver_numeric_or "${DELIVER_STATE_POLL_INTERVAL:-}" 1)"
  for state_poll in $(seq 1 "$state_poll_attempts"); do
    if herdr_project_cmd pane list --workspace "$ws_id" 2>/dev/null \
      | jq -e --arg pane_id "$opencode_pane_id" 'any(.result.panes[]; .pane_id == $pane_id and .agent_status == "working")' >/dev/null 2>&1; then
      state_confirmed=true
      break
    fi
    sleep "$state_poll_interval"
  done
  if [[ "$state_confirmed" == "true" ]]; then
    _ok "OpenCode v2 launched — build kicked off (prompt: ${prompt_arg})"
  else
    _warn "Could not confirm that the build kicked off automatically in pane ${opencode_pane_id} (agent status never showed 'working')."
    # Epistemics: send-keys exit 0 proves herdr accepted the keystroke, not
    # that the editor consumed it — say "sent", never "submitted".
    echo "  Enter was sent — if the build did not start, press Enter in the pane to run the seeded prompt."
  fi
  return 0
}

# ── Main ───────────────────────────────────────────────────────────

# Parse flags and positional args
profile=""
pick=false
dry_run=false
nightshift=false
mode=""       # issue_id | pr | prompt | bare_branch
mode_arg=""   # the argument for the mode

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage_text >&1
      exit 0
      ;;
    --profile)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Error: --profile requires a value" >&2
        exit 1
      fi
      profile="$1"
      ;;
    --pick)
      pick=true
      ;;
    --dry-run)
      dry_run=true
      ;;
    --nightshift)
      nightshift=true
      ;;
    --pr)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Error: --pr requires a PR number" >&2
        exit 1
      fi
      if [[ -n "$mode" ]]; then
        echo "Error: Multiple modes specified (--pr and another mode)." >&2
        exit 1
      fi
      mode="pr"
      mode_arg="$1"
      ;;
    -p)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Error: -p requires a description" >&2
        exit 1
      fi
      if [[ -n "$mode" ]]; then
        echo "Error: Multiple modes specified (-p and another mode)." >&2
        exit 1
      fi
      mode="prompt"
      mode_arg="$1"
      ;;
    *)
      if [[ -z "$mode" && -z "$mode_arg" ]]; then
        mode_arg="$1"
      else
        echo "Error: Unexpected argument '$1'" >&2
        exit 1
      fi
      ;;
  esac
  shift
done

# Classify positional arg when no mode flag was given
if [[ -z "$mode" ]]; then
  if [[ -z "$mode_arg" ]]; then
    usage
  fi

  if [[ "$mode_arg" != */* && ( "$mode_arg" =~ ^[A-Z]+-[0-9]+$ || "$mode_arg" =~ ^[Rr][Ee][Pp]- ) ]]; then
    _validate_issue_id "$mode_arg" || exit 1
    mode="issue_id"
  elif [[ "$mode_arg" =~ ^[0-9]+$ ]]; then
    mode="pr"
  elif [[ "$mode_arg" =~ ^[a-zA-Z0-9] ]]; then
    # Bare branch mode — must start with alphanumeric (avoids matching dashes or special chars)
    mode="bare_branch"
  else
    echo "Error: Invalid argument '$mode_arg'. Expected an issue ID (REP-123), PR number (42), or branch name." >&2
    exit 1
  fi
fi

# Validate mutual exclusivity of --profile and --pick
if [[ -n "$profile" && "$pick" == true ]]; then
  echo "Error: --profile and --pick are mutually exclusive" >&2
  exit 1
fi

# Resolve --pick into a concrete profile before worktree creation
if [[ "$pick" == true ]]; then
  profiles=()
  for pf in "$REPO_ROOT/.opencode/profiles/"*.json; do
    [[ -f "$pf" ]] || continue
    profiles+=("$(basename "$pf" .json)")
  done

  if [[ ${#profiles[@]} -eq 0 ]]; then
    echo "Error: No profiles found in $REPO_ROOT/.opencode/profiles/" >&2
    echo "Create a .json profile file before using --pick." >&2
    exit 1
  fi

  if [[ ${#profiles[@]} -eq 1 ]]; then
    profile="${profiles[0]}"
  elif command -v fzf > /dev/null 2>&1; then
    profile="$(printf '%s\n' "${profiles[@]}" | fzf --prompt="Select a profile: " --height=~15 --reverse)" || exit 2
    [[ -n "$profile" ]] || exit 2
  elif [[ ! -t 0 ]]; then
    echo "Error: Cannot show interactive picker: stdin is not a terminal and fzf is not installed." >&2
    exit 1
  else
    echo "" >&2
    echo "Select a profile:" >&2
    i=1
    for item in "${profiles[@]}"; do
      printf '  %d) %s\n' "$i" "$item" >&2
      i=$((i + 1))
    done
    echo "" >&2
    choice=""
    read -r -p "Enter number (1-${#profiles[@]}): " choice </dev/tty
    [[ -n "$choice" ]] || exit 2
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [[ "$choice" -lt 1 ]] || [[ "$choice" -gt ${#profiles[@]} ]]; then
      echo "Error: Invalid selection." >&2
      exit 1
    fi
    profile="${profiles[$((choice - 1))]}"
  fi
fi

# Validate profile existence
if [[ -n "$profile" ]]; then
  profile_file="$REPO_ROOT/.opencode/profiles/${profile}.json"
  if [[ ! -f "$profile_file" ]]; then
    echo "Error: Profile '$profile' not found at $profile_file" >&2
    echo "Available profiles:" >&2
    ls "$REPO_ROOT/.opencode/profiles/"*.json 2>/dev/null \
      | sed 's/.*\///; s/\.json$//' \
      | sed 's/^/  - /' >&2 || true
    exit 1
  fi
fi

# ── Mode dispatch ──────────────────────────────────────────────────

case "$mode" in
  issue_id)
    echo "Resolving issue ${mode_arg}..."
    issue_data="$(_mode_issue_id "$mode_arg")"
    issue_id="$(sed -n '1p' <<< "$issue_data")"
    branch="$(sed -n '2p' <<< "$issue_data")"
    title="$(sed -n '3p' <<< "$issue_data")"
    delivery_command="$(sed -n '4p' <<< "$issue_data")"

    _ok "Mode: Issue ${issue_id}"
    [[ -n "$title" ]] && echo "  Title: $title"
    echo "  Branch: ${branch:-auto}"
    echo "  Command: ${delivery_command}"

    label="$issue_id"
    slug="$(slugify "$issue_id")"

    _create_worktree_and_launch \
      "issue_id" \
      "$issue_id" \
      "$branch" \
      "$slug" \
      "$label" \
      "$delivery_command" \
      "$profile" \
      "$nightshift" \
      "$dry_run" \
      "" \
      "$title"
    ;;

  pr)
    echo "Resolving PR #${mode_arg}..."
    pr_data="$(_mode_pr "$mode_arg")" || exit $?
    pr_issue_id="$(sed -n '1p' <<< "$pr_data")"
    pr_branch="$(sed -n '2p' <<< "$pr_data")"
    pr_title="$(sed -n '3p' <<< "$pr_data")"

    _ok "Mode: PR #${mode_arg}"
    [[ -n "$pr_title" ]] && echo "  Title: $pr_title"
    echo "  Branch: ${pr_branch:-unknown}"

    if [[ -z "$pr_branch" ]]; then
      _err "Could not determine branch for PR #${mode_arg}."
      exit 1
    fi

    delivery_command="/build"
    if [[ -n "$pr_issue_id" ]]; then
      delivery_command="$(resolve_command "$pr_issue_id")"
    fi

    label="${pr_issue_id:-pr-${mode_arg}}"
    slug="pr-$(slugify "$mode_arg")"

    _create_worktree_and_launch \
      "pr" \
      "${pr_issue_id:-}" \
      "$pr_branch" \
      "$slug" \
      "$label" \
      "$delivery_command" \
      "$profile" \
      "$nightshift" \
      "$dry_run" \
      "$mode_arg"
    ;;

  prompt)
    echo "Generating branch for prompt mode..."
    prompt_data="$(_mode_prompt "$mode_arg")"
    prompt_branch="$(sed -n '1p' <<< "$prompt_data")"
    prompt_title="$(sed -n '2p' <<< "$prompt_data")"

    if [[ -z "$prompt_branch" ]]; then
      prompt_branch="scratch-$(date +%Y%m%d-%H%M%S)"
    fi

    _ok "Mode: Prompt"
    echo "  Description: $mode_arg"
    echo "  Branch: $prompt_branch"
    echo "  Workspace: ${prompt_title:-$prompt_branch}"

    label="${prompt_title:-$prompt_branch}"
    slug="$(slugify "$prompt_branch")"

    _create_worktree_and_launch \
      "prompt" \
      "" \
      "$prompt_branch" \
      "$slug" \
      "$label" \
      "/build" \
      "$profile" \
      "$nightshift" \
      "$dry_run"
    ;;

  bare_branch)
    echo "Resolving bare branch..."
    branch_data="$(_mode_bare_branch "$mode_arg")"
    bare_issue_id="$(sed -n '1p' <<< "$branch_data")"
    bare_branch="$(sed -n '2p' <<< "$branch_data")"

    _ok "Mode: Bare Branch"
    echo "  Branch: $bare_branch"

    delivery_command="/build"
    if [[ -n "$bare_issue_id" ]]; then
      delivery_command="$(resolve_command "$bare_issue_id")"
    fi

    label="${bare_issue_id:-$bare_branch}"
    slug="$(slugify "$label")"

    _create_worktree_and_launch \
      "bare_branch" \
      "${bare_issue_id:-}" \
      "$bare_branch" \
      "$slug" \
      "$label" \
      "$delivery_command" \
      "$profile" \
      "$nightshift" \
      "$dry_run"
    ;;

  *)
    echo "Error: Unknown mode '$mode'" >&2
    exit 1
    ;;
esac
