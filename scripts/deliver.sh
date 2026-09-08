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

  # Use jq to check for Bug and Pen labels
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

# ── Mode functions ─────────────────────────────────────────────────
_mode_issue_id() {
  local issue_id="$1"
  local delivery_command
  delivery_command="$(resolve_command "$issue_id")"

  local issue_json branch title
  issue_json="$(linear issue show "$issue_id" --json 2>/dev/null || true)"

  if [[ -n "$issue_json" ]]; then
    branch="$(printf '%s' "$issue_json" | jq -r '.item.branchName // .branchName // empty' 2>/dev/null || true)"
    title="$(printf '%s' "$issue_json" | jq -r '.item.title // .title // empty' 2>/dev/null || true)"
  fi

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
    # Fetch PR head ref from GitHub
    git fetch origin "pull/${mode_arg}/head" 2>/dev/null || {
      _err "Could not fetch PR #${mode_arg}. The branch may have been deleted."
      echo "  Try: git fetch origin pull/${mode_arg}/head" >&2
      exit 1
    }
    git worktree add "$wt_path" "FETCH_HEAD"
    # Create a local branch at this ref so it can be pushed
    git -C "$wt_path" checkout -b "$branch"
    git push -u origin "$branch" 2>/dev/null || true
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
  ws_id="$(_herdr_workspace_add_sibling "$wt_path" "$label")"

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
  root_pane_id="$(herdr pane list --workspace "$ws_id" 2>/dev/null | jq -r '.result.panes[0].pane_id // .result.panes[0].id // empty' 2>/dev/null || true)"
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
  right_split_result="$(herdr pane split --pane "$root_pane_id" --direction right --cwd "$wt_path" --ratio 0.7 --no-focus 2>&1)" || true
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
    herdr pane run "$term_pane_id" "cd \"$wt_path\" && pnpm install" 2>/dev/null || true
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
  herdr pane run "$opencode_pane_id" "cd \"$wt_path\" && $opencode_cmd" || {
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
    pane_visible="$(herdr pane read --source visible "$opencode_pane_id" 2>/dev/null | tr -d '\r\n' || true)"
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
  if ! herdr pane send-keys "$opencode_pane_id" enter >/dev/null 2>&1; then
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
    if herdr pane list --workspace "$ws_id" 2>/dev/null \
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
      "$dry_run"
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
    slug="$(slugify "$label")"

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
