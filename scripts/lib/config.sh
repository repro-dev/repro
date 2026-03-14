#!/bin/bash

cmd_config() {
  if [ $# -lt 1 ]; then
    cat <<'USAGE'
Usage: reproctl config <subcommand>

Subcommands:
  path    Print the path to the active config file
  show    Print the current config contents (pretty-printed JSON)
  edit    Open the config file in $EDITOR
USAGE
    exit 1
  fi

  local subcmd="$1"
  shift

  case "$subcmd" in
    path) cmd_config_path "$@" ;;
    show) cmd_config_show "$@" ;;
    edit) cmd_config_edit "$@" ;;
    -h|--help)
      cat <<'USAGE'
Usage: reproctl config <subcommand>

Subcommands:
  path    Print the path to the active config file
  show    Print the current config contents (pretty-printed JSON)
  edit    Open the config file in $EDITOR
USAGE
      ;;
    *)
      die "Unknown config subcommand: $subcmd\nRun 'reproctl config --help' for usage."
      ;;
  esac
}

cmd_config_path() {
  echo "$CONFIG_FILE"
}

cmd_config_show() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo "No config file found at $CONFIG_FILE"
    echo "Run 'reproctl start <service>' to create one."
    return 1
  fi

  python3 -m json.tool "$CONFIG_FILE"
}

cmd_config_edit() {
  local editor="${EDITOR:-vi}"

  if [ ! -f "$CONFIG_FILE" ]; then
    die "No config file found at $CONFIG_FILE\nRun 'reproctl start <service>' to create one."
  fi

  "$editor" "$CONFIG_FILE"
}
