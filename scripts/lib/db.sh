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

_resolve_db_name() {
  if is_worktree "$REPO_ROOT"; then
    local slug
    slug="$(detect_worktree_slug)"
    echo "repro_wt_$(printf '%s' "$slug" | tr '-' '_')"
  else
    echo "repro"
  fi
}

DB_NAME="$(_resolve_db_name)"

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
    echo "$(_wt_name "api-server" "$slug")-migrations"
  else
    echo "api-server-migrations"
  fi
}

seed_resource_name() {
  if is_worktree "$REPO_ROOT"; then
    local slug
    slug="$(detect_worktree_slug)"
    echo "db-seed-wt-$slug"
  else
    echo "db-seed"
  fi
}

# ── Subcommands ─────────────────────────────────────────────────────

cmd_db_reset() {
  require_tilt
  require_psql

  local skip_confirm=false
  for arg in "$@"; do
    case "$arg" in
      -y|--yes) skip_confirm=true ;;
    esac
  done

  if [ "$skip_confirm" = false ]; then
    printf 'This will drop and recreate the database (%s). Continue? [y/N] ' "$DB_NAME"
    read -r answer
    case "$answer" in
      [yY]) ;;
      *) echo "Aborted." >&2; exit 2 ;;
    esac
  fi

  if is_worktree "$REPO_ROOT"; then
    _step 1 3 "Dropping and recreating worktree database ($DB_NAME)..."
    PGPASSWORD="$DB_PASSWORD" "$PSQL" -h "$DB_HOST" -p "$DB_PORT" \
      -U "$DB_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS $DB_NAME" \
      -c "CREATE DATABASE $DB_NAME"

    local resource
    resource="$(migrations_resource_name)"
    _step 2 3 "Triggering migrations ($resource)..."
    if tilt get uiresource "$resource" --port "$TILT_PORT" > /dev/null 2>&1; then
      tilt trigger "$resource" --port "$TILT_PORT"
    else
      _warn "Migrations resource '$resource' is not loaded — run migrations manually."
    fi

    local seed
    seed="$(seed_resource_name)"
    _step 3 3 "Triggering seed ($seed)..."
    if tilt get uiresource "$seed" --port "$TILT_PORT" > /dev/null 2>&1; then
      tilt trigger "$seed" --port "$TILT_PORT"
    else
      _warn "Seed resource '$seed' is not loaded — run seed manually."
    fi

    _ok "Database reset complete — migrations and seed triggered"
  else
    _step 1 1 "Triggering database reset..."
    if ! tilt get uiresource db-reset --port "$TILT_PORT" > /dev/null 2>&1; then
      die "The db-reset resource is not loaded in Tilt.\nStart services first with 'reproctl start api-server'."
    fi
    tilt trigger db-reset --port "$TILT_PORT"
    _ok "Database reset triggered — watch Tilt for progress"
  fi
} >&2

cmd_db_migrate() {
  require_tilt

  local resource
  resource="$(migrations_resource_name)"

  _step 1 1 "Triggering migrations ($resource)..."
  if ! tilt get uiresource "$resource" --port "$TILT_PORT" > /dev/null 2>&1; then
    die "Migrations resource '$resource' is not loaded in Tilt.\nStart the service first with 'reproctl start api-server'."
  fi
  tilt trigger "$resource" --port "$TILT_PORT"
  _ok "Migrations triggered — watch Tilt for progress"
}

cmd_db_seed() {
  require_tilt

  local resource
  resource="$(seed_resource_name)"

  _step 1 1 "Triggering seed ($resource)..."
  if ! tilt get uiresource "$resource" --port "$TILT_PORT" > /dev/null 2>&1; then
    die "Seed resource '$resource' is not loaded in Tilt.\nStart the service first with 'reproctl start api-server'."
  fi
  tilt trigger "$resource" --port "$TILT_PORT"
  _ok "Seed triggered — watch Tilt for progress"
}

cmd_db_shell() {
  require_tilt
  require_psql

  _step 1 1 "Connecting to cluster database ($DB_NAME via Tilt port-forward)..." >&2
  PGPASSWORD="$DB_PASSWORD" exec "$PSQL" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
} >&2

cmd_db_status() {
  local tilt_running=true
  if ! tilt_is_running; then
    tilt_running=false
  fi

  if [ "${REPROCTL_JSON:-false}" = true ]; then
    _db_status_json "$tilt_running"
    return
  fi

  local w
  w="$(_label_width "Host:" "User:" "Database:" "Tilt:")"

  echo "Cluster database (via Tilt port-forward):"
  _kv "$w" "Host:" "$DB_HOST:$DB_PORT" "  "
  _kv "$w" "User:" "$DB_USER" "  "
  _kv "$w" "Database:" "$DB_NAME" "  "

  if [ "$tilt_running" = false ]; then
    _kv "$w" "Tilt:" "not running — port-forward unavailable" "  "
    return
  fi

  if [ -z "$PSQL" ]; then
    echo ""
    echo "Install psql to view migration status: brew install postgresql@17"
    return
  fi

  local migrations_dir="$REPO_ROOT/apps/api-server/src/migrations/data"
  if [ ! -d "$migrations_dir" ]; then
    echo ""
    echo "Migrations directory not found: $migrations_dir"
    return
  fi

  local applied
  applied="$(PGPASSWORD="$DB_PASSWORD" "$PSQL" -h "$DB_HOST" -p "$DB_PORT" \
    -U "$DB_USER" -d "$DB_NAME" -t -A \
    -c "SELECT name FROM kysely_migration ORDER BY name" 2>/dev/null)" || {
    echo ""
    echo "Migrations: unable to query — is the database resource healthy?"
    return
  }

  local on_disk
  on_disk="$(ls "$migrations_dir"/*.sql 2>/dev/null | xargs -n1 basename | sort)"

  local pending
  pending="$(comm -23 <(echo "$on_disk") <(echo "$applied"))"

  local orphaned
  orphaned="$(comm -13 <(echo "$on_disk") <(echo "$applied"))"

  echo ""
  if [ -z "$pending" ] && [ -z "$orphaned" ]; then
    echo "Migrations: up to date ($(echo "$applied" | wc -l | tr -d ' ') applied)"
  else
    if [ -n "$pending" ]; then
      echo "Migrations: $(echo "$pending" | wc -l | tr -d ' ') pending"
      echo "$pending" | while read -r name; do
        echo "  + $name"
      done
    fi
    if [ -n "$orphaned" ]; then
      echo "Migrations: $(echo "$orphaned" | wc -l | tr -d ' ') applied but missing from disk"
      echo "$orphaned" | while read -r name; do
        echo "  - $name"
      done
    fi
  fi
}

_db_status_json() {
  local tilt_running="${1:-true}"
  local applied_list="" pending_list="" orphaned_list=""
  local migrations_dir="$REPO_ROOT/apps/api-server/src/migrations/data"
  local available=true

  if [ "$tilt_running" = false ] || [ -z "$PSQL" ] || [ ! -d "$migrations_dir" ]; then
    available=false
  fi

  if [ "$available" = true ]; then
    local applied
    applied="$(PGPASSWORD="$DB_PASSWORD" "$PSQL" -h "$DB_HOST" -p "$DB_PORT" \
      -U "$DB_USER" -d "$DB_NAME" -t -A \
      -c "SELECT name FROM kysely_migration ORDER BY name" 2>/dev/null)" || {
      available=false
      applied=""
    }

    if [ "$available" = true ]; then
      local on_disk
      on_disk="$(ls "$migrations_dir"/*.sql 2>/dev/null | xargs -n1 basename | sort)"

      if [ -n "$applied" ]; then
        applied_list="$applied"
      fi

      if [ -n "$on_disk" ] && [ -n "$applied" ]; then
        pending_list="$(comm -23 <(echo "$on_disk") <(echo "$applied"))"
        orphaned_list="$(comm -13 <(echo "$on_disk") <(echo "$applied"))"
      elif [ -n "$on_disk" ]; then
        pending_list="$on_disk"
      fi
    fi
  fi

  python3 -c '
import json, sys

def lines_to_list(s):
    return [l for l in s.splitlines() if l.strip()] if s else []

obj = {
    "host": sys.argv[1],
    "port": int(sys.argv[2]),
    "database": sys.argv[3],
    "available": sys.argv[4] == "true",
    "migrations": {
        "applied": lines_to_list(sys.argv[5]),
        "pending": lines_to_list(sys.argv[6]),
        "orphaned": lines_to_list(sys.argv[7]),
    }
}
print(json.dumps(obj))
' "$DB_HOST" "$DB_PORT" "$DB_NAME" "$available" "$applied_list" "$pending_list" "$orphaned_list"
}

# ── Router ──────────────────────────────────────────────────────────

cmd_db() {
  local usage="Usage: reproctl db <reset|migrate|seed|shell|status>"

  if [ $# -eq 0 ]; then
    echo "$usage" >&2
    exit 1
  fi

  local subcmd="$1"
  shift

  case "$subcmd" in
    reset)   cmd_db_reset "$@" ;;
    migrate) cmd_db_migrate "$@" ;;
    seed)    cmd_db_seed "$@" ;;
    shell)   cmd_db_shell "$@" ;;
    status)  cmd_db_status "$@" ;;
    -h|--help)
      cat <<'EOF'
Usage: reproctl db <subcommand>

Subcommands:
  reset    Drop and recreate the database, then migrate and seed
  migrate  Run pending database migrations
  seed     Run database seed (idempotent)
  shell    Open a psql session against the cluster database
  status   Show connection info and whether migrations are up to date

Options (reset):
  -y, --yes  Skip confirmation prompt
EOF
      ;;
    *)
      die "Unknown db subcommand: $subcmd\n$usage"
      ;;
  esac
}
