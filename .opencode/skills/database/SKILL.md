---
name: database
description: PostgreSQL 17 conventions, Kysely ORM and migration tracking, version pinning locations (CI, Tilt, Brewfile). Load when writing migrations, modifying schemas, or working with database queries.
---

# Database

## PostgreSQL

- Target version: **PostgreSQL 17** (supported until November 2029)
- Pinned in: CI (`.github/workflows/ci.yml`), Tilt (`infra/apps/data/Tiltfile`), and local dev (`Brewfile`)

## Migrations

- **ORM / migration tool: Kysely** (not Drizzle)
- Migration tracking table: `public.kysely_migration` (columns: `name`, `timestamp`)
- Lock table: `public.kysely_migration_lock`
