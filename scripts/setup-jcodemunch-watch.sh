#!/usr/bin/env bash
# setup-jcodemunch-watch.sh
# -------------------------
# Installs or uninstalls the jCodeMunch watch-claude LaunchAgent.
#
# Usage:
#   scripts/setup-jcodemunch-watch.sh install    # resolve template + launchctl load
#   scripts/setup-jcodemunch-watch.sh uninstall  # launchctl unload + remove plist
#   scripts/setup-jcodemunch-watch.sh status     # show whether the agent is running
#   scripts/setup-jcodemunch-watch.sh logs       # tail the watch log

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_TMPL="$REPO_ROOT/infra/jcodemunch-watch.plist.tmpl"
PLIST_LABEL="dev.repro.jcodemunch-watch"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/$PLIST_LABEL.plist"
LOG_FILE="/tmp/jcodemunch-watch.log"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

resolve_jcodemunch_bin() {
  if ! command -v jcodemunch-mcp &>/dev/null; then
    echo "ERROR: jcodemunch-mcp not found in PATH." >&2
    echo "       Install with: pip install jcodemunch-mcp" >&2
    exit 1
  fi
  # Dereference any symlinks to get the real executable path, which launchd
  # needs since it doesn't inherit PATH from the user's shell.
  local bin
  bin="$(command -v jcodemunch-mcp)"
  # Follow symlinks if possible (readlink -f on macOS requires coreutils;
  # fall back gracefully to the raw path)
  if command -v realpath &>/dev/null; then
    realpath "$bin"
  else
    bin
  fi
}

render_plist() {
  local jcodemunch_bin="$1"
  local repo_root="$2"
  # Bash 3.2-compatible substitution — no sed -E features needed
  local content
  content="$(cat "$PLIST_TMPL")"
  content="${content//@@JCODEMUNCH_BIN@@/$jcodemunch_bin}"
  content="${content//@@REPO_ROOT@@/$repo_root}"
  printf '%s\n' "$content"
}

cmd_install() {
  local jcodemunch_bin
  jcodemunch_bin="$(resolve_jcodemunch_bin)"

  mkdir -p "$LAUNCH_AGENTS_DIR"

  echo "Resolving template..."
  echo "  jcodemunch-mcp: $jcodemunch_bin"
  echo "  repo root:      $REPO_ROOT"

  render_plist "$jcodemunch_bin" "$REPO_ROOT" > "$PLIST_DEST"
  echo "Written: $PLIST_DEST"

  # Unload first if already registered (handles reinstall / path changes)
  if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
    echo "Agent already loaded — reloading..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
  fi

  launchctl load "$PLIST_DEST"
  echo ""
  echo "jCodeMunch watch-claude is now running."
  echo "  Logs:   tail -f $LOG_FILE"
  echo "  Status: launchctl list | grep jcodemunch"
}

cmd_uninstall() {
  if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    echo "LaunchAgent unloaded."
  else
    echo "LaunchAgent was not loaded."
  fi

  if [ -f "$PLIST_DEST" ]; then
    rm "$PLIST_DEST"
    echo "Removed: $PLIST_DEST"
  else
    echo "No plist found at $PLIST_DEST"
  fi

  echo "jCodeMunch watch-claude daemon uninstalled."
}

cmd_status() {
  echo "=== LaunchAgent registration ==="
  launchctl list | grep "$PLIST_LABEL" || echo "(not registered)"
  echo ""
  echo "=== Installed plist ==="
  if [ -f "$PLIST_DEST" ]; then
    echo "$PLIST_DEST (exists)"
  else
    echo "(not installed)"
  fi
  echo ""
  echo "=== Recent log entries ==="
  if [ -f "$LOG_FILE" ]; then
    tail -20 "$LOG_FILE"
  else
    echo "(no log file yet — agent may not have started)"
  fi
}

cmd_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No log file at $LOG_FILE — agent may not have started yet."
    exit 1
  fi
  tail -f "$LOG_FILE"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "${1:-}" in
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  status)    cmd_status ;;
  logs)      cmd_logs ;;
  *)
    echo "Usage: $0 {install|uninstall|status|logs}"
    exit 1
    ;;
esac
