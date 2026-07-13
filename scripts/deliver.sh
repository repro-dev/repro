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
# Bug → /bugfix, everything else → /build (fail-open default).
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

  # Use jq instead of python3 to check for Bug label
  if printf '%s' "$json_output" | jq -e '
    .labels // [] | map(select(.name == "Bug")) | length > 0
  ' >/dev/null 2>&1; then
    echo "/bugfix"
  else
    echo "/build"
  fi
}

# ── Mode functions ─────────────────────────────────────────────────
_mode_issue_id() {
  local issue_id="$1"
  local delivery_command
  delivery_command="$(resolve_command "$issue_id")"

  local issue_json branch title
  issue_json="$(linear issue show "$issue_id" --json 2>/dev/null || true)"

  if [[ -n "$issue_json" ]]; then
    branch="$(printf '%s' "$issue_json" | jq -r '.branchName // empty' 2>/dev/null || true)"
    title="$(printf '%s' "$issue_json" | jq -r '.title // empty' 2>/dev/null || true)"
  fi

  printf '%s\n%s\n%s\n%s\n' "$issue_id" "${branch:-}" "${title:-}" "$delivery_command"
}

_mode_pr() {
  local pr_number="$1"

  if ! command -v gh >/dev/null 2>&1; then
    _err "gh CLI is required for PR mode."
    echo "  Install it: brew install gh" >&2
    exit 1
  fi

  local pr_json
  pr_json="$(gh pr view "$pr_number" --json headRefName,body,title 2>/dev/null)" || {
    _err "Could not fetch PR #${pr_number}. Check that the PR exists and you are authenticated."
    exit 1
  }

  local branch title body
  branch="$(printf '%s' "$pr_json" | jq -r '.headRefName // empty' 2>/dev/null || true)"
  title="$(printf '%s' "$pr_json" | jq -r '.title // empty' 2>/dev/null || true)"
  body="$(printf '%s' "$pr_json" | jq -r '.body // ""' 2>/dev/null || true)"

  # Extract Linear issue ID from branch name (preferred) or PR body
  local issue_id=""
  if [[ "$branch" =~ [A-Z]+-[0-9]+ ]]; then
    issue_id="${BASH_REMATCH[0]}"
  elif [[ "$body" =~ [A-Z]+-[0-9]+ ]]; then
    issue_id="${BASH_REMATCH[0]}"
  fi

  printf '%s\n%s\n%s\n' "$issue_id" "$branch" "$title"

  if [[ -z "$issue_id" ]]; then
    _warn "No Linear issue ID found in PR #${pr_number} (checked branch name and body)."
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

  local wt_path prompt_arg
  wt_path="$(worktree_path "$slug")"

  # Build prompt argument: command + optional issue ID
  if [[ -n "${issue_id:-}" ]]; then
    prompt_arg="$delivery_command $issue_id"
  else
    prompt_arg="$delivery_command"
  fi

  echo ""
  _step 1 4 "Creating worktree for branch: ${CLR_BOLD}${branch}${CLR_RESET}"

  if [[ "$dry_run" == "true" ]]; then
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Mode: ${mode}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Branch: ${branch}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Worktree path: ${wt_path}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Workspace label: ${label}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Command: ${delivery_command}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Profile: ${profile_arg:-default}"
    echo "  ${CLR_DIM}[dry-run]${CLR_RESET} Nightshift: ${nightshift}"
    echo ""
    echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
    return 0
  fi

  # Stage 1: Worktree creation
  if [[ "$mode" == "issue_id" ]]; then
    # Use reproctl for full issue workflow (fetch from Linear, branch creation, etc.)
    # Note: --open is deliberately omitted; herdr workspace is handled via sibling workspace below
    "$SCRIPT_DIR/reproctl.sh" wt create --from-issue "$issue_id" --no-status-update
  elif [[ "$mode" == "bare_branch" ]]; then
    # Bare branch mode — checkout existing branch or create from HEAD
    if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
      git worktree add "$wt_path" "$branch"
    else
      git worktree add -b "$branch" "$wt_path"
    fi
    git push -u origin "$branch" 2>/dev/null || true
  else
    # PR and prompt modes — create new branch from latest main
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
  ws_id="$(_herdr_workspace_add_sibling "$wt_path" "$label")"

  if [[ -z "$ws_id" ]]; then
    _warn "herdr not available — worktree created but no OpenCode session was opened."
    echo ""
    echo "  cd $wt_path"
    echo "  opencode run -i \"$prompt_arg\""
    return 0
  fi
  _ok "Workspace: ${label} (${ws_id})"

  # Stage 3: Bootstrap (async)
  _step 3 4 "Bootstrapping workspace (async)..."
  local pane_id
  pane_id="$(herdr pane list --workspace "$ws_id" --json 2>/dev/null | jq -r '.[0].pane_id // .[0].id // empty' 2>/dev/null || true)"
  if [[ -n "$pane_id" && "$pane_id" != "null" ]]; then
    herdr pane run "$pane_id" "cd '$wt_path' && pnpm bootstrap" 2>/dev/null || true
    _ok "Bootstrap started in workspace pane"
  else
    _warn "Could not find a pane for the workspace — bootstrap skipped."
  fi

  # Stage 4: Agent launch
  _step 4 4 "Launching OpenCode agent..."
  local nightshift_flags=""
  if [[ "$nightshift" == "true" ]]; then
    nightshift_flags="--permission-mode acceptEdits --disallowed-tools AskUserQuestion"
  fi

  local agent_name="opencode-${label}"

  if [[ -n "$profile_arg" ]]; then
    exec herdr agent start "$agent_name" \
      --workspace "$ws_id" \
      --focus \
      $nightshift_flags \
      -- bash -c 'cd "$1" && exec "$2" opencode --profile "$3" --prompt "$4"' _ "$wt_path" "$SCRIPT_DIR/reproctl.sh" "$profile_arg" "$prompt_arg"
  else
    exec herdr agent start "$agent_name" \
      --workspace "$ws_id" \
      --focus \
      $nightshift_flags \
      -- bash -c 'cd "$1" && REPRO_OPENCODE_PROFILE="$2" exec "$3" opencode --prompt "$4"' _ "$wt_path" "${REPRO_OPENCODE_PROFILE:-deepseek-v4}" "$SCRIPT_DIR/reproctl.sh" "$prompt_arg"
  fi
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

  if [[ "$mode_arg" =~ ^[A-Z]+-[0-9]+$ ]]; then
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
    _step "" "" "Resolving issue ${mode_arg}..."
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
    slug="$(printf '%s' "$issue_id" | tr '[:upper:]' '[:lower:]')"

    _create_worktree_and_launch \
      "issue_id" \
      "$issue_id" \
      "$branch" \
      "$slug" \
      "$label" \
      "$delivery_command" \
      "$profile" \
      "$nightshift" \
      "$dry_run"
    ;;

  pr)
    _step "" "" "Resolving PR #${mode_arg}..."
    pr_data="$(_mode_pr "$mode_arg")"
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
    slug="$(printf '%s' "$label" | tr '[:upper:]' '[:lower:]')"

    _create_worktree_and_launch \
      "pr" \
      "${pr_issue_id:-}" \
      "$pr_branch" \
      "$slug" \
      "$label" \
      "$delivery_command" \
      "$profile" \
      "$nightshift" \
      "$dry_run"
    ;;

  prompt)
    _step "" "" "Generating branch for prompt mode..."
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
    slug="$(printf '%s' "$prompt_branch" | tr '[:upper:]' '[:lower:]')"

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
    _step "" "" "Resolving bare branch..."
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
    slug="$(printf '%s' "$label" | tr '[:upper:]' '[:lower:]')"

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
