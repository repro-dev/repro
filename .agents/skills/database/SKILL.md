---
name: database
description: PostgreSQL 17 conventions, Kysely ORM and migration tracking, version pinning locations (CI, Tilt, Brewfile). Load when writing migrations, modifying schemas, or working with database queries.
---

# Database

## PostgreSQL

- Target version: **PostgreSQL 17** (supported until November 2029)
- Pinned in: CI (`.github/workflows/ci.yml`), Tilt (`infra/apps/data/Tiltfile`), and local dev (`Brewfile`)
- Prefer PostgreSQL functions and expressions that are portable across the local test cluster and CI/runtime environments. If a convenience helper is missing in one environment, use the more portable SQL form rather than depending on one deployment having extra built-ins.

## Migrations

- **ORM / migration tool: Kysely** (not Drizzle)
- Migration tracking table: `public.kysely_migration` (columns: `name`, `timestamp`)
- Lock table: `public.kysely_migration_lock`
- Migration files live in `apps/api-server/src/migrations/data/`
- **Filename format**: `YYYYMMDDHHmmss-<slug>.sql` (e.g. `20260328120000-create-users.sql`)
  - Use wall-clock UTC timestamp at file creation time as the prefix — no coordination needed between branches
  - Keep the descriptive slug suffix unchanged
  - The migration runner (`SQLFileMigrationProvider`) sorts files lexicographically — timestamps sort correctly this way
  - CI will fail if two migration files share the same timestamp prefix (collision guard in `.github/workflows/ci.yml`)
- **Adding a migration**: create a new `.sql` file with the current UTC timestamp as prefix; never use sequential integer prefixes
- **Migration sections**: every SQL migration file must include properly delimited `-- Up` and `-- Down` sections; the `SQLFileMigrationProvider` rejects files without both section markers
- **Migration tracking**: Kysely stores migration names (full basename including `.sql`) in `kysely_migration`. The `migrate()` function performs a one-time rename of any legacy numeric-prefix entries before running migrations.
- **Limitation**: timestamp ordering reduces accidental collisions but does not enforce semantic dependencies between parallel PRs. PRs with implicit migration dependencies (e.g. one alters a table created by another) must be merged in the correct order.

## Portability notes

- Do not assume convenience JSONB helpers are available everywhere. For example, if `jsonb_object_length` is unavailable in the target environment, use a portable fallback based on `jsonb_object_keys(...)` counts inside explicit `CASE` expressions.
- Prefer writing migration assertions so they degrade predictably across PostgreSQL environments rather than depending on one exact server build.

## Local verification stability

- A failing full DB-backed test suite is not automatically evidence of a bad migration or query change. Check whether the failure is environmental first.
- Known local-cluster failure modes include shared-memory exhaustion (for example `shmget ... No space left on device`) and other test-cluster resource limits.
- When the full suite is unstable for environmental reasons, run the narrowest migration-, provider-, or package-scoped verification that still exercises the changed database behavior, and record the broader failure separately as environment noise or a follow-up issue.
