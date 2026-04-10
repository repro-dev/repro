import { Kysely, Migration, MigrationProvider, sql } from 'kysely'
import fs from 'node:fs/promises'
import path from 'node:path'

// Matches `YYYYMMDDHHmmss-<slug>.sql` — the timestamp is 14 digits.
const TIMESTAMP_FILENAME_REGEXP = /^(\d{14})-(.+)\.sql$/

function parseMigrationFilename(filename: string): boolean {
  return TIMESTAMP_FILENAME_REGEXP.test(path.basename(filename))
}

function parseMigrationText(
  text: string
): { up: string; down: string } | undefined {
  const upCommentBlockResult = text.match(/^(-+)\n^-- Up\n^\1\n/m)
  if (!upCommentBlockResult) return

  const upCommentBlockStart = upCommentBlockResult.index!
  const upCommentBlockEnd = upCommentBlockStart + upCommentBlockResult[0].length

  const textAfterUp = text.slice(upCommentBlockEnd)
  const downCommentBlockResult = textAfterUp.match(/^(-+)\n^-- Down\n^\1\n/m)
  if (!downCommentBlockResult) return

  const downCommentBlockStart =
    upCommentBlockEnd + downCommentBlockResult.index!
  const downCommentBlockEnd =
    downCommentBlockStart + downCommentBlockResult[0].length

  return {
    up: text.slice(upCommentBlockEnd, downCommentBlockStart),
    down: text.slice(downCommentBlockEnd),
  }
}

export class SQLFileMigrationProvider implements MigrationProvider {
  constructor(private readonly dir: string = path.resolve(__dirname, 'data')) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const entries = await fs.readdir(this.dir)

    // Only process .sql files
    const sqlFiles = entries.filter(f => f.endsWith('.sql'))

    // Validate all sql files use timestamp format — fail loudly on old-style numeric prefixes
    for (const filename of sqlFiles) {
      if (!parseMigrationFilename(filename)) {
        throw new Error(
          `Migration filename "${filename}" does not match the required timestamp format: ` +
            `YYYYMMDDHHmmss-<slug>.sql (e.g. 20260328120000-create-users.sql). ` +
            `Old numeric prefixes are no longer supported.`
        )
      }
    }

    // Sort lexicographically — timestamps (YYYYMMDDHHmmss) sort correctly this way
    sqlFiles.sort()

    const migrations: Record<string, Migration> = {}

    for (const filename of sqlFiles) {
      const filepath = path.join(this.dir, filename)
      const text = await fs.readFile(filepath, 'utf-8')
      const parsed = parseMigrationText(text)

      if (!parsed) {
        throw new Error(
          `Migration file "${filename}" could not be parsed. ` +
            `Ensure it has properly delimited -- Up and -- Down sections.`
        )
      }

      const { up, down } = parsed

      // Use full basename as the key so Kysely's tracking table entries are stable
      migrations[filename] = {
        async up(db: Kysely<unknown>) {
          await db.executeQuery(sql.raw(up).compile(db))
        },
        async down(db: Kysely<unknown>) {
          await db.executeQuery(sql.raw(down).compile(db))
        },
      }
    }

    return migrations
  }
}
