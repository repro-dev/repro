#!/bin/bash
#
# scripts/lib/db.sh — database operations
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/services.sh to be loaded first.

# Connection details for the in-cluster Postgres, accessible via Tilt's
# port-forward (configured in infra/apps/data/Tiltfile).
DB_HOST="localhost"
DB_PORT="15432"
DB_USER="repro"
DB_PASSWORD="repro"
DB_NAME="repro"

# ── Helpers ─────────────────────────────────────────────────────────

# postgresql@17 is keg-only on macOS; locate psql even if the keg bin
# isn't on PATH (e.g. outside direnv context).
PSQL="$(command -v psql 2>/dev/null || true)"
if [ -z "$PSQL" ] && [ -x "/opt/homebrew/opt/postgresql@17/bin/psql" ]; then
  PSQL="/opt/homebrew/opt/postgresql@17/bin/psql"
fi

require_psql() {
  if [ -z "$PSQL" ]; then
    die "psql is not installed. Install it with: brew install postgresql@17"
  fi
}

require_tilt() {
  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi
}

migrations_resource_name() {
  if is_worktree "$REPO_ROOT"; then
    local slug
    slug="$(detect_worktree_slug)"
    echo "api-server-wt-${slug}-migrations"
  else
    echo "api-server-migrations"
  fi
}

# ── Subcommands ─────────────────────────────────────────────────────

cmd_db_reset() {
  if is_worktree "$REPO_ROOT"; then
    die "db reset is only available from the main checkout.\nThe db-reset Tilt resource does not exist in worktree context."
  fi

  require_tilt

  local skip_confirm=false
  for arg in "$@"; do
    case "$arg" in
      -y|--yes) skip_confirm=true ;;
    esac
  done

  if [ "$skip_confirm" = false ]; then
    printf 'This will drop and recreate the database. Continue? [y/N] '
    read -r answer
    case "$answer" in
      [yY]) ;;
      *) echo "Aborted."; return 0 ;;
    esac
  fi

  echo "Triggering database reset..."
  if ! tilt get uiresource db-reset --port "$TILT_PORT" > /dev/null 2>&1; then
    die "The db-reset resource is not loaded in Tilt.\nStart services first with 'reproctl start api-server'."
  fi
  tilt trigger db-reset --port "$TILT_PORT"
  echo "db-reset triggered. Watch Tilt for progress."
}

cmd_db_migrate() {
  require_tilt

  local resource
  resource="$(migrations_resource_name)"

  echo "Triggering migrations ($resource)..."
  if ! tilt get uiresource "$resource" --port "$TILT_PORT" > /dev/null 2>&1; then
    die "Migrations resource '$resource' is not loaded in Tilt.\nStart the service first with 'reproctl start api-server'."
  fi
  tilt trigger "$resource" --port "$TILT_PORT"
  echo "Migrations triggered. Watch Tilt for progress."
}

cmd_db_shell() {
  require_tilt
  require_psql

  echo "Connecting to cluster database ($DB_NAME via Tilt port-forward)..."
  PGPASSWORD="$DB_PASSWORD" exec "$PSQL" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

cmd_db_status() {
  require_tilt

  echo "Cluster database (via Tilt port-forward):"
  echo "  Host:     $DB_HOST:$DB_PORT"
  echo "  User:     $DB_USER"
  echo "  Database: $DB_NAME"

  if [ -n "$PSQL" ]; then
    echo ""
    echo "Recent migrations:"
    PGPASSWORD="$DB_PASSWORD" "$PSQL" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 10" \
      2>/dev/null || echo "  (unable to query — is the database resource healthy?)"
  else
    echo ""
    echo "Install psql to view migration status: brew install postgresql@17"
  fi
}

# ── Router ──────────────────────────────────────────────────────────

cmd_db() {
  local usage="Usage: reproctl db <reset|migrate|shell|status>"

  if [ $# -eq 0 ]; then
    echo "$usage" >&2
    exit 1
  fi

  local subcmd="$1"
  shift

  case "$subcmd" in
    reset)   cmd_db_reset "$@" ;;
    migrate) cmd_db_migrate "$@" ;;
    shell)   cmd_db_shell "$@" ;;
    status)  cmd_db_status "$@" ;;
    -h|--help)
      cat <<'EOF'
Usage: reproctl db <subcommand>

Subcommands:
  reset    Drop and recreate the database (main checkout only)
  migrate  Run pending database migrations
  shell    Open a psql session against the cluster database
  status   Show cluster database connection info and recent migrations

Options (reset):
  -y, --yes  Skip confirmation prompt
EOF
      ;;
    *)
      die "Unknown db subcommand: $subcmd\n$usage"
      ;;
  esac
}
