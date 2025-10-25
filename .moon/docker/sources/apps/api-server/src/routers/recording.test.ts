import {
  CODEC_VERSION,
  InteractionType,
  RecordingMode,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { toWireFormat } from '@repro/wire-formats'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { chain, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { RecordingService } from '~/services/recording'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { readableToString } from '~/testing/utils'
import { createRecordingRouter } from './recording'

function expectISODate() {
  return expect.stringMatching(
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  )
}

describe('Routers > Recording', () => {
  let harness: Harness
  let recordingService: RecordingService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    recordingService = harness.services.recordingService
    app = harness.bootstrap(
      createRecordingRouter(
        harness.services.recordingService,
        harness.services.accountService
      )
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should create a new recording', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/',
      body: {
        title: 'Title',
        url: 'https://repro.test',
        description: 'Description',
        mode: RecordingMode.Replay,
        duration: 10_000,
        browserName: 'Chromium',
        browserVersion: '120.0.0',
        operatingSystem: 'Linux x86_64',
      },
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(201)
    expect(res.json()).toEqual({
      id: expect.any(String),
      title: 'Title',
      url: 'https://repro.test',
      description: 'Description',
      mode: RecordingMode.Replay,
      duration: 10_000,
      browserName: 'Chromium',
      browserVersion: '120.0.0',
      operatingSystem: 'Linux x86_64',
      createdAt: expectISODate(),
      codecVersion: CODEC_VERSION,
    })
  })

  it('should get info for a public recording', async () => {
    const [recording] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
    ])

    const res = await app.inject({
      method: 'GET',
      url: `/${recording.id}/info`,
    })

    expect(res.statusCode).toEqual(200)
    expect(res.json()).toEqual(recording)
  })

  it('should fail to get info for a private recording', async () => {
    const [recording] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.project.ProjectA_Multiple_Recordings,
    ])

    const res = await app.inject({
      method: 'GET',
      url: `/${recording.id}/info`,
    })

    expect(res.statusCode).toEqual(404)
  })

  it('should get the info for a private recording as a staff user', async () => {
    const [recording, _, session] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.project.ProjectA_Multiple_Recordings,
      fixtures.account.StaffUserA_Session,
    ])

    const res = await app.inject({
      method: 'GET',
      url: `/${recording.id}/info`,
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(200)
    expect(res.json()).toEqual(recording)
  })

  it('should save a resource for a recording', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const { id } = await promise(
      recordingService.writeInfo(
        'Title',
        'https://repro.test',
        'Description',
        RecordingMode.Replay,
        10_000,
        'Chromium',
        '120.0.0',
        'Linux x86_64'
      )
    )

    const res = await app.inject({
      method: 'PUT',
      url: `/${id}/resources/foo`,
      body: 'foo-resource-data',
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(201)

    const resource = await promise(
      recordingService
        .readResourceAsStream(id, 'foo')
        .pipe(chain(readableToString))
    )

    expect(resource).toEqual('foo-resource-data')
  })

  it('should save the resource map for a recording', async () => {
    const [sesion] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const { id } = await promise(
      recordingService.writeInfo(
        'Title',
        'https://repro.test',
        'Description',
        RecordingMode.Replay,
        10_000,
        'Chromium',
        '120.0.0',
        'Linux x86_64'
      )
    )

    const res = await app.inject({
      method: 'PUT',
      url: `/${id}/resource-map`,
      body: {
        foo: 'https://example.com/foo.jpg',
        bar: 'https://example.com/bar.jpg',
        baz: 'https://example.com/baz.jpg',
      },
      cookies: {
        [harness.env.SESSION_COOKIE]: sesion.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(201)

    const resourceMap = await promise(recordingService.readResourceMap(id))

    expect(resourceMap).toEqual({
      foo: 'https://example.com/foo.jpg',
      bar: 'https://example.com/bar.jpg',
      baz: 'https://example.com/baz.jpg',
    })
  })

  it('should save event data for a recording', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const { id } = await promise(
      recordingService.writeInfo(
        'Title',
        'https://repro.test',
        'Description',
        RecordingMode.Replay,
        10_000,
        'Chromium',
        '120.0.0',
        'Linux x86_64'
      )
    )

    const events: Array<SourceEvent> = [
      new Box({
        type: SourceEventType.Interaction,
        time: 0,
        data: new Box({
          type: InteractionType.PointerMove,
          from: [0, 0],
          to: [100, 100],
          duration: 50,
        }),
      }),
      new Box({
        type: SourceEventType.Interaction,
        time: 0,
        data: new Box({
          type: InteractionType.PointerMove,
          from: [100, 100],
          to: [200, 200],
          duration: 35,
        }),
      }),
    ]

    const res = await app.inject({
      method: 'PUT',
      url: `/${id}/data`,
      body: events.map(toWireFormat).join('\n'),
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(201)
  })

  it('should fail to overwrite an existing recording', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const { id } = await promise(
      recordingService.writeInfo(
        'Title',
        'https://repro.test',
        'Description',
        RecordingMode.Replay,
        10_000,
        'Chromium',
        '120.0.0',
        'Linux x86_64'
      )
    )

    const eventsA: Array<SourceEvent> = [
      new Box({
        type: SourceEventType.Interaction,
        time: 0,
        data: new Box({
          type: InteractionType.PointerMove,
          from: [0, 0],
          to: [100, 100],
          duration: 50,
        }),
      }),
    ]

    const eventsB: Array<SourceEvent> = [
      new Box({
        type: SourceEventType.Interaction,
        time: 0,
        data: new Box({
          type: InteractionType.PointerMove,
          from: [100, 100],
          to: [0, 0],
          duration: 50,
        }),
      }),
    ]

    await app.inject({
      method: 'PUT',
      url: `/${id}/data`,
      body: eventsA.map(toWireFormat).join('\n'),
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/${id}/data`,
      body: eventsB.map(toWireFormat).join('\n'),
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(409)
  })

  it('should fail to write data for a recording that does not exist', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const events: Array<SourceEvent> = [
      new Box({
        type: SourceEventType.Interaction,
        time: 0,
        data: new Box({
          type: InteractionType.PointerMove,
          from: [0, 0],
          to: [100, 100],
          duration: 50,
        }),
      }),
    ]

    const res = await app.inject({
      method: 'PUT',
      url: `/${encodeId(999)}/data`,
      body: events.map(toWireFormat).join('\n'),
      cookies: {
        [harness.env.SESSION_COOKIE]: session.sessionToken,
      },
    })

    expect(res.statusCode).toEqual(404)
  })

  // TODO: investigate - validating via a transform stream might add too much overhead
  it.skip('should fail to write invalid recording data', async () => {
    const { id } = await promise(
      recordingService.writeInfo(
        'Title',
        'https://repro.test',
        'Description',
        RecordingMode.Replay,
        10_000,
        'Chromium',
        '120.0.0',
        'Linux x86_64'
      )
    )

    const res = await app.inject({
      method: 'PUT',
      url: `/${id}/data`,
      body: 'Invalid event data',
    })

    expect(res.statusCode).toEqual(400)
  })
})
