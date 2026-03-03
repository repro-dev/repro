#!/bin/bash
#
# scripts/lib/context_bundle.sh — generate a self-contained context document
# for subagent delegation
#
# Sourced by reproctl.sh. Expects common.sh, context.sh, and worktree.sh
# to be loaded first.

cmd_context_bundle() {
  local issue_id=""
  local wt_path=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --issue|-i)
        if [[ -z "${2:-}" ]]; then
          die "--issue requires an issue identifier (e.g. REP-123)"
        fi
        issue_id="$2"
        shift 2
        ;;
      --worktree|-w)
        if [[ -z "${2:-}" ]]; then
          die "--worktree requires a path"
        fi
        wt_path="$2"
        shift 2
        ;;
      -h|--help)
        cat <<'USAGE'
Usage: reproctl context-bundle [options]

Generate a self-contained markdown context document for subagent delegation.

Options:
  --issue, -i <id>        Linear issue identifier (e.g. REP-123)
  --worktree, -w <path>   Absolute path to worktree (default: current repo root)

When run without arguments, the issue is inferred from the current branch
and the worktree path is the current repo root.
USAGE
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'reproctl context-bundle --help' for usage."
        ;;
    esac
  done

  if [[ -z "$wt_path" ]]; then
    wt_path="$REPO_ROOT"
  fi

  if [[ -z "$issue_id" ]]; then
    local branch
    branch="$(git -C "$wt_path" symbolic-ref -q --short HEAD 2>/dev/null)" || branch=""
    if [[ -n "$branch" ]]; then
      issue_id="$(_extract_issue_id "$branch")"
    fi
  fi

  # Validate issue identifier format (prevents GraphQL injection)
  if [[ -n "$issue_id" ]] && [[ ! "$issue_id" =~ ^[A-Z]+-[0-9]+$ ]]; then
    die "Invalid issue identifier: '$issue_id'. Expected format: REP-123"
  fi

  local issue_section=""

  if [[ -n "$issue_id" ]]; then
    if [[ -n "${LINEAR_API_KEY:-}" ]]; then
      local query response formatted
      query="{ issueSearch(filter: { identifier: { eq: \"${issue_id}\" } }, first: 1) { nodes { id identifier title description } } }"
      response="$(_linear_api "$query" 2>/dev/null)" || response=""

      if [[ -n "$response" ]]; then
        formatted="$(printf '%s' "$response" | python3 "$SCRIPTS_DIR/lib/py/linear_format_issue_bundle.py" 2>/dev/null)" || formatted=""
        if [[ -n "$formatted" ]]; then
          issue_section="$formatted"
        fi
      fi
    else
      issue_section="(LINEAR_API_KEY not set — issue details unavailable)"
    fi
  fi

  local changed_files=""
  changed_files="$(git -C "$wt_path" diff main...HEAD --name-only 2>/dev/null)" || changed_files=""

  local has_shell=false
  local has_ts=false

  if [[ -n "$changed_files" ]]; then
    if printf '%s' "$changed_files" | grep -qE '\.sh$'; then
      has_shell=true
    fi
    if printf '%s' "$changed_files" | grep -qE '\.(ts|tsx)$'; then
      has_ts=true
    fi
  fi

  if [[ "$has_shell" != true ]] && [[ "$has_ts" != true ]]; then
    has_shell=true
    has_ts=true
  fi

  local conventions_dir="$SCRIPTS_DIR/lib/context_bundle_conventions"
  local conventions=""

  if [[ -f "$conventions_dir/general.md" ]]; then
    conventions="$(cat "$conventions_dir/general.md")"
  fi

  if [[ "$has_shell" == true ]] && [[ -f "$conventions_dir/shell.md" ]]; then
    conventions="${conventions}
$(cat "$conventions_dir/shell.md")"
  fi

  if [[ "$has_ts" == true ]] && [[ -f "$conventions_dir/typescript.md" ]]; then
    conventions="${conventions}
$(cat "$conventions_dir/typescript.md")"
  fi

  local relevant_files=""
  if [[ -n "$changed_files" ]]; then
    relevant_files="$(printf '%s' "$changed_files" | head -20 | sed 's/^/- /')"
  fi

  local verification=""
  if [[ "$has_shell" == true ]]; then
    verification="- Bash syntax: bash -n <modified .sh files>"
  fi
  if [[ "$has_ts" == true ]]; then
    if [[ -n "$verification" ]]; then
      verification="${verification}
- Typecheck: moon run <package>:typecheck
- Test: tsx --experimental-test-module-mocks --test <test file>
- Format: pnpm fmt"
    else
      verification="- Typecheck: moon run <package>:typecheck
- Test: tsx --experimental-test-module-mocks --test <test file>
- Format: pnpm fmt"
    fi
  fi
  if [[ "$has_shell" == true ]]; then
    verification="${verification}
- Python tests: python3 -m pytest scripts/lib/py/tests/ -v"
  fi

  local header="# Context: ${issue_id:-unknown}"

  printf '%s\n' "$header"
  printf '\n'

  printf '## Issue\n'
  if [[ -n "$issue_section" ]]; then
    printf '%s\n' "$issue_section"
  else
    printf 'No issue information available.\n'
  fi
  printf '\n'

  printf '## Working directory\n'
  printf 'Absolute path: %s\n' "$wt_path"
  printf 'IMPORTANT: All file operations must use absolute paths under this directory.\n'
  printf '\n'

  printf '## Codebase conventions\n'
  if [[ -n "$conventions" ]]; then
    printf '%s\n' "$conventions"
  fi
  printf '\n'

  if [[ -n "$relevant_files" ]]; then
    printf '## Relevant files\n'
    printf '%s\n' "$relevant_files"
    printf '\n'
  fi

  if [[ -n "$verification" ]]; then
    printf '## Verification commands\n'
    printf '%s\n' "$verification"
  fi
}
