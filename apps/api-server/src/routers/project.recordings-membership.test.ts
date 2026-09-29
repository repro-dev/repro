import { RecordingMode } from '@repro/domain'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { chain, promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId, encodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createRecordingDataWireFormat } from '~/testing/recording'
import { readableToString } from '~/testing/utils'
import { errorType, notFound } from '~/utils/errors'
import { createProjectRouter } from './project'

describe('Routers > Project recording membership', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    app = harness.bootstrap(
      createProjectRouter(
        harness.services.projectService,
        harness.services.recordingService,
        harness.services.accountService
      )
    )
    await app.ready()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('links a project-created recording into that project list', async () => {
    const [project, _, session] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.UserA_ProjectA_Contributor,
      fixtures.account.UserA_Session,
    ])

    const createRes = await app.inject({
      method: 'POST',
      url: `/${project.id}/recordings`,
      body: {
        title: 'Uploaded recording',
        url: 'https://example.com/uploaded',
        description: 'Created through the project route',
        mode: RecordingMode.Replay,
        duration: 1234,
        browserName: 'Chrome',
        browserVersion: '120.0.0',
        operatingSystem: 'Linux x86_64',
      },
      cookies: {
        [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
      },
    })

    expect(createRes.statusCode).toEqual(201)
    const recording = createRes.json()
    expect(recording.title).toEqual('Uploaded recording')
    expect(recording.description).toEqual('Created through the project route')

    const listRes = await app.inject({
      method: 'GET',
      url: `/${project.id}/recordings`,
      cookies: {
        [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
      },
    })

    expect(listRes.statusCode).toEqual(200)
    expect(listRes.json()).toEqual({ items: [recording] })
  })

  it('accepts and persists an empty description for uploaded recordings', async () => {
    const [project, , session] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.UserA_ProjectA_Contributor,
      fixtures.account.UserA_Session,
    ])

    const createRes = await app.inject({
      method: 'POST',
      url: `/${project.id}/recordings`,
      body: {
        title: 'No description provided',
        url: 'https://example.com/no-description',
        description: '',
        mode: RecordingMode.Replay,
        duration: 0,
        browserName: 'Chrome',
        browserVersion: '120.0.0',
        operatingSystem: 'Linux x86_64',
      },
      cookies: {
        [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
      },
    })

    expect(createRes.statusCode).toEqual(201)
    const recording = createRes.json()
    expect(recording.title).toEqual('No description provided')
    expect(recording.description).toEqual('')

    const listRes = await app.inject({
      method: 'GET',
      url: `/${project.id}/recordings`,
      cookies: {
        [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
      },
    })

    expect(listRes.statusCode).toEqual(200)
    expect(listRes.json()).toEqual({ items: [recording] })
  })

  it('returns not-found when reading a project A recording through project B', async () => {
    const [
      projectB,
      recording,
      data,
      [resourceId, resource],
      [, resourceMap],
      ,
      ,
      session,
    ] = await harness.loadFixtures([
      fixtures.project.ProjectB,
      fixtures.recording.RecordingA,
      fixtures.recording.RecordingA_Data,
      fixtures.recording.RecordingA_ResourceA,
      fixtures.recording.RecordingA_WithResourceMap,
      fixtures.project.ProjectA_Multiple_Recordings,
      fixtures.project.UserA_Multiple_Projects,
      fixtures.account.UserA_Session,
    ])

    const cookie = app.signCookie(session.sessionToken)
    const requests = [
      {
        url: `/${projectB.id}/recordings/${recording.id}/info`,
        body: recording,
      },
      { url: `/${projectB.id}/recordings/${recording.id}/data`, body: data },
      {
        url: `/${projectB.id}/recordings/${recording.id}/resources/${resourceId}`,
        body: resource,
      },
      {
        url: `/${projectB.id}/recordings/${recording.id}/resource-map`,
        body: resourceMap,
      },
    ]

    for (const request of requests) {
      const res = await app.inject({
        method: 'GET',
        url: request.url,
        cookies: { [harness.env.SESSION_COOKIE]: cookie },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.body).not.toEqual(request.body)
    }
  })

  it('returns not-found without side effects when mutating a project A recording through project B', async () => {
    const [projectB, recording, , , session] = await harness.loadFixtures([
      fixtures.project.ProjectB,
      fixtures.recording.RecordingA,
      fixtures.project.ProjectA_Multiple_Recordings,
      fixtures.project.UserA_Multiple_Projects,
      fixtures.account.UserA_Session,
    ])
    const cookie = app.signCookie(session.sessionToken)
    const resourceId = encodeId(999)
    const decodedRecordingId = decodeId(recording.id)
    const data = createRecordingDataWireFormat([])

    expect(decodedRecordingId).not.toEqual(null)

    const responses = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `/${projectB.id}/recordings/${recording.id}/data`,
        body: data,
        cookies: { [harness.env.SESSION_COOKIE]: cookie },
      }),
      app.inject({
        method: 'PUT',
        url: `/${projectB.id}/recordings/${recording.id}/resources/${resourceId}`,
        body: 'data:text/plain,cross-project-write',
        cookies: { [harness.env.SESSION_COOKIE]: cookie },
      }),
      app.inject({
        method: 'PUT',
        url: `/${projectB.id}/recordings/${recording.id}/resource-map`,
        body: { [resourceId]: 'https://example.com/cross-project.png' },
        cookies: { [harness.env.SESSION_COOKIE]: cookie },
      }),
      app.inject({
        method: 'PUT',
        url: `/${projectB.id}/recordings/${recording.id}/event-index`,
        body: {
          entries: [
            {
              eventIndex: 0,
              eventType: 1,
              timeMs: 0,
              byteOffset: 0,
              byteLength: 10,
            },
          ],
        },
        cookies: { [harness.env.SESSION_COOKIE]: cookie },
      }),
      app.inject({
        method: 'DELETE',
        url: `/${projectB.id}/recordings/${recording.id}`,
        cookies: { [harness.env.SESSION_COOKIE]: cookie },
      }),
    ])

    expect(responses.map(res => res.statusCode)).toEqual([
      404, 404, 404, 404, 404,
    ])

    await expect(
      promise(
        harness.services.recordingService
          .readDataAsStream(recording.id)
          .pipe(chain(readableToString))
      )
    ).rejects.toThrow(errorType(notFound()))
    await expect(
      promise(
        harness.services.recordingService
          .readResourceAsStream(recording.id, resourceId)
          .pipe(chain(readableToString))
      )
    ).rejects.toThrow(errorType(notFound()))
    await expect(
      promise(harness.services.recordingService.readResourceMap(recording.id))
    ).resolves.toEqual({})
    await expect(
      harness.db
        .selectFrom('recording_event_index')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('recordingId', '=', decodedRecordingId)
        .executeTakeFirstOrThrow()
    ).resolves.toEqual({ count: 0 })
    await expect(
      promise(harness.services.recordingService.readInfo(recording.id))
    ).resolves.toEqual(recording)
  })
})
