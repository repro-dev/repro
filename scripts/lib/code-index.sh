#!/bin/bash
#
# scripts/lib/code-index.sh — code intelligence index management commands
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides CLR_BOLD, CLR_RESET, die).

cmd_code_index_help() {
  cat <<EOF
Usage: reproctl code-index <command> [options]

Manage jcodemunch code-intelligence indexes for the monorepo.

${CLR_BOLD}Commands:${CLR_RESET}
  help                        Show this usage summary

${CLR_BOLD}Examples:${CLR_RESET}
  reproctl code-index help    Show this help text
EOF
}

cmd_code_index() {
  if [ $# -eq 0 ]; then
    cmd_code_index_help >&2
    exit 1
  fi

  local subcmd="$1"
  shift

  case "$subcmd" in
    help|-h|--help)
      cmd_code_index_help
      exit 0
      ;;
    *)
      die "Unknown code-index command: $subcmd\nRun 'reproctl code-index help' for usage."
      ;;
  esac
}
