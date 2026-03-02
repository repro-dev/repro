# Database

## PostgreSQL

- Target version: **PostgreSQL 17** (supported until November 2029)
- Pinned in: CI (`.github/workflows/ci.yml`), Tilt (`infra/apps/data/Tiltfile`), and local dev (`Brewfile`)

## Migrations

- **ORM / migration tool: Kysely** (not Drizzle)
- Migration tracking table: `public.kysely_migration` (columns: `name`, `timestamp`)
- Lock table: `public.kysely_migration_lock`
