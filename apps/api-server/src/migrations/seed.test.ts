import expect from 'expect'
import { chain, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fixtureRecordings } from '~/fixtures/recordings'
import { encodeId } from '~/modules/database'
import { createTestHarness, Harness } from '~/testing'
import { createRecordingDataUncompressed } from '~/testing/recording'
import { readableToString } from '~/testing/utils'
import { seed } from './seed'

describe('Migrations > seed', () => {
  let harness: Harness

  before(async () => {
    harness = await createTestHarness()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('stores all seeded recordings as uncompressed binary wire format', async () => {
    await seed(harness.db, harness.storage)

    for (const fixture of fixtureRecordings) {
      const recording = await harness.db
        .selectFrom('recordings')
        .select(['id', 'duration'])
        .where('title', '=', fixture.title)
        .where('url', '=', fixture.url)
        .executeTakeFirstOrThrow()

      expect(recording.duration).toEqual(fixture.duration)

      const data = await promise(
        harness.services.recordingService
          .readDataAsStream(encodeId(recording.id))
          .pipe(chain(readableToString))
      )

      expect(data).toEqual(
        createRecordingDataUncompressed(fixture.events).toString()
      )
    }
  })

  it('is idempotent when called twice (seed-level — recordings pre-check prevents duplicate INSERTs)', async () => {
    // Validates seed()-level idempotency: the full seed() function produces
    // no duplicate rows on re-run. The recordings pre-check (title+url SELECT
    // in insertRecording, seed-recordings.ts ~line 37-47) short-circuits
    // before reaching either the recordings INSERT or the project_recordings
    // INSERT/ON CONFLICT. For a direct test of the project_recordings ON
    // CONFLICT defense-in-depth, see "handles duplicate project_recordings
    // insert via ON CONFLICT" below.

    // First run
    await seed(harness.db, harness.storage)

    const recordingsAfterFirst = await harness.db
      .selectFrom('recordings')
      .selectAll()
      .execute()

    const projectRecordingsAfterFirst = await harness.db
      .selectFrom('project_recordings')
      .selectAll()
      .execute()

    // Second run must not throw
    await seed(harness.db, harness.storage)

    const recordingsAfterSecond = await harness.db
      .selectFrom('recordings')
      .selectAll()
      .execute()

    const projectRecordingsAfterSecond = await harness.db
      .selectFrom('project_recordings')
      .selectAll()
      .execute()

    expect(recordingsAfterSecond.length).toEqual(recordingsAfterFirst.length)
    expect(projectRecordingsAfterSecond.length).toEqual(
      projectRecordingsAfterFirst.length
    )
  })

  it('handles duplicate project_recordings insert via ON CONFLICT defense-in-depth', async () => {
    // Exercises the .onConflict(oc => oc.column('recordingId').doNothing())
    // path in seed-recordings.ts directly. This guards the partial-commit/
    // orphan scenario where a project_recordings row already exists for a
    // recordingId but the recordings pre-check (title+url) did not
    // short-circuit — e.g. interrupted seed or manual db reset.

    await seed(harness.db, harness.storage)

    // Get an existing project_recordings row to extract a known recordingId
    const existingRow = await harness.db
      .selectFrom('project_recordings')
      .selectAll()
      .executeTakeFirstOrThrow()

    // Count rows with this recordingId before the duplicate attempt
    const countBefore = await harness.db
      .selectFrom('project_recordings')
      .selectAll()
      .where('recordingId', '=', existingRow.recordingId)
      .execute()

    // Attempt an insert with the same recordingId (exercises ON CONFLICT)
    await harness.db
      .insertInto('project_recordings')
      .values({
        projectId: existingRow.projectId,
        recordingId: existingRow.recordingId,
        authorId: existingRow.authorId,
      })
      .onConflict(oc => oc.column('recordingId').doNothing())
      .execute()

    // Verify no duplicate row was created
    const countAfter = await harness.db
      .selectFrom('project_recordings')
      .selectAll()
      .where('recordingId', '=', existingRow.recordingId)
      .execute()

    expect(countAfter.length).toEqual(countBefore.length)
  })
})
