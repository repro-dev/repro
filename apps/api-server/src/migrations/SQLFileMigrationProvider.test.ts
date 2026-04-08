import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { SQLFileMigrationProvider } from './SQLFileMigrationProvider'

const VALID_SQL = `--
-- Up
--

CREATE TABLE test (id SERIAL PRIMARY KEY);

--
-- Down
--

DROP TABLE IF EXISTS test;
`

async function makeDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'migration-test-'))
}

describe('SQLFileMigrationProvider', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await makeDir()
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns migrations sorted lexicographically by filename', async () => {
    const dir = await makeDir()

    await fs.writeFile(path.join(dir, '20260101120000-first.sql'), VALID_SQL)
    await fs.writeFile(path.join(dir, '20260101130000-second.sql'), VALID_SQL)
    await fs.writeFile(path.join(dir, '20260102000000-third.sql'), VALID_SQL)

    const provider = new SQLFileMigrationProvider(dir)
    const migrations = await provider.getMigrations()
    const keys = Object.keys(migrations)

    assert.deepEqual(keys, [
      '20260101120000-first.sql',
      '20260101130000-second.sql',
      '20260102000000-third.sql',
    ])
  })

  it('uses the full basename (with .sql extension) as the migration key', async () => {
    const dir = await makeDir()

    await fs.writeFile(
      path.join(dir, '20260201100000-create-users.sql'),
      VALID_SQL
    )

    const provider = new SQLFileMigrationProvider(dir)
    const migrations = await provider.getMigrations()

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        migrations,
        '20260201100000-create-users.sql'
      )
    )
  })

  it('rejects files that do not match the timestamp prefix format', async () => {
    const dir = await makeDir()

    // Old-style numeric prefix — must not be accepted
    await fs.writeFile(
      path.join(dir, '000001-create-recording-table.sql'),
      VALID_SQL
    )

    const provider = new SQLFileMigrationProvider(dir)

    await assert.rejects(() => provider.getMigrations(), /timestamp/i)
  })

  it('ignores non-.sql files in the directory', async () => {
    const dir = await makeDir()

    await fs.writeFile(
      path.join(dir, '20260301090000-migration.sql'),
      VALID_SQL
    )
    await fs.writeFile(path.join(dir, 'README.md'), '# Migrations')
    await fs.writeFile(path.join(dir, '.gitkeep'), '')

    const provider = new SQLFileMigrationProvider(dir)
    const migrations = await provider.getMigrations()

    assert.deepEqual(Object.keys(migrations), ['20260301090000-migration.sql'])
  })

  it('parses up and down sections from sql file', async () => {
    const dir = await makeDir()

    const sql = `--
-- Up
--

CREATE TABLE foo (id SERIAL PRIMARY KEY);

--
-- Down
--

DROP TABLE IF EXISTS foo;
`
    await fs.writeFile(path.join(dir, '20260401080000-create-foo.sql'), sql)

    const provider = new SQLFileMigrationProvider(dir)
    const migrations = await provider.getMigrations()
    const migration = migrations['20260401080000-create-foo.sql']

    assert.ok(migration, 'migration should exist')
    assert.ok(typeof migration.up === 'function', 'up should be a function')
    assert.ok(typeof migration.down === 'function', 'down should be a function')
  })

  it('returns empty object when directory has no sql files', async () => {
    const dir = await makeDir()

    const provider = new SQLFileMigrationProvider(dir)
    const migrations = await provider.getMigrations()

    assert.deepEqual(migrations, {})
  })

  it('rejects files without a descriptive slug after the timestamp', async () => {
    const dir = await makeDir()

    // Filename with no slug — only a timestamp
    await fs.writeFile(path.join(dir, '20260501120000.sql'), VALID_SQL)

    const provider = new SQLFileMigrationProvider(dir)

    await assert.rejects(() => provider.getMigrations(), /timestamp/i)
  })
})
