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
})
