import { ApiClient } from '@repro/api-client'
import { FetchOptions } from '@repro/api-client/src/types'
import { Project, ProjectRole, RecordingInfo, User } from '@repro/domain'
import {
  FutureInstance,
  fork,
  reject as futureReject,
  promise,
  resolve,
} from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createProject,
  deactivateProject,
  deleteAccount,
  getAccountSettings,
  getProject,
  getProjectMembers,
  getProjectRecordings,
  getProjects,
  getRecordingPrivacyPreset,
  inviteProjectMember,
  removeProjectMember,
  renameAccount,
  renameProject,
  updateProjectMemberRole,
  updateRecordingPrivacyPreset,
} from './queries'

type CallRecord = { url: string; options: FetchOptions }

// Minimal stub ApiClient that records calls and returns a configurable response
function createStubApiClient(
  responseFactory: (url: string, options?: { body?: string }) => unknown
): ApiClient & { calls: Array<CallRecord> } {
  const calls: Array<CallRecord> = []

  return {
    calls,
    authStore: {} as never,
    fetch<R = unknown>(
      url: string,
      options: FetchOptions = {}
    ): FutureInstance<Error, R> {
      calls.push({ url, options })
      const body = options.body != null ? String(options.body) : undefined
      return resolve(responseFactory(url, { body }) as R)
    },
    debug: () => () => undefined,
    wrapP<R>(_method: FutureInstance<unknown, R>): Promise<R> {
      return Promise.resolve(undefined as unknown as R)
    },
  }
}

const fakeProject: Project = { id: 'proj-1', name: 'My Project' }

const fakeUser: User = {
  type: 'user',
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  verified: true,
}

const fakeRecording: RecordingInfo = {
  id: 'rec-1',
  title: 'Session 1',
  url: 'https://example.com',
  description: '',
  mode: 1,
  duration: 60000,
  createdAt: '2026-01-01T00:00:00Z',
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: 'macOS',
  codecVersion: '1.0.0',
}

const fakeAccountSettings = {
  id: 'account-1',
  name: 'Repro Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  userCount: 3,
  projectCount: 2,
}

describe('workspace-api: queries', () => {
  describe('getProjects', () => {
    it('fetches GET /projects and unwraps items envelope', async () => {
      const stub = createStubApiClient(() => ({ items: [fakeProject] }))
      const result = await promise(getProjects(stub))
      assert.deepEqual(result, [fakeProject])
    })

    it('calls the correct URL', async () => {
      const stub = createStubApiClient(() => ({ items: [] }))
      await promise(getProjects(stub))
      assert.equal(stub.calls[0]?.url, '/projects')
    })
  })

  describe('getProject', () => {
    it('fetches GET /projects/:projectId and returns the project', async () => {
      const stub = createStubApiClient(() => fakeProject)
      const result = await promise(getProject(stub, 'proj-1'))
      assert.deepEqual(result, fakeProject)
    })

    it('calls the correct URL', async () => {
      const stub = createStubApiClient(() => fakeProject)
      await promise(getProject(stub, 'proj-1'))
      assert.equal(stub.calls[0]?.url, '/projects/proj-1')
    })
  })

  describe('createProject', () => {
    it('POSTs to /projects with name in body and returns created project', async () => {
      const stub = createStubApiClient(() => fakeProject)
      const result = await promise(createProject(stub, 'My Project'))
      assert.deepEqual(result, fakeProject)
    })

    it('calls the correct URL with POST method', async () => {
      const stub = createStubApiClient(() => fakeProject)
      await promise(createProject(stub, 'My Project'))
      const call = stub.calls[0]
      assert.equal(call?.url, '/projects')
      assert.equal(call?.options.method, 'post')
    })

    it('serialises name in JSON body', async () => {
      const stub = createStubApiClient(() => fakeProject)
      await promise(createProject(stub, 'My Project'))
      const body = stub.calls[0]?.options.body as string
      assert.deepEqual(JSON.parse(body), { name: 'My Project' })
    })

    it('relies on api-client for JSON content-type header', async () => {
      const stub = createStubApiClient(() => fakeProject)
      await promise(createProject(stub, 'My Project'))
      assert.equal(stub.calls[0]?.options.headers, undefined)
    })
  })

  describe('renameProject', () => {
    it('PUTs to /projects/:projectId/name and returns updated project', async () => {
      const updated = { ...fakeProject, name: 'Renamed' }
      const stub = createStubApiClient(() => updated)
      const result = await promise(renameProject(stub, 'proj-1', 'Renamed'))
      assert.deepEqual(result, updated)
    })

    it('calls the correct URL with PUT method', async () => {
      const stub = createStubApiClient(() => fakeProject)
      await promise(renameProject(stub, 'proj-1', 'Renamed'))
      const call = stub.calls[0]
      assert.equal(call?.url, '/projects/proj-1/name')
      assert.equal(call?.options.method, 'put')
    })

    it('serialises name in JSON body', async () => {
      const stub = createStubApiClient(() => fakeProject)
      await promise(renameProject(stub, 'proj-1', 'Renamed'))
      const body = stub.calls[0]?.options.body as string
      assert.deepEqual(JSON.parse(body), { name: 'Renamed' })
    })
  })

  describe('deactivateProject', () => {
    it('PUTs to /projects/:projectId/active with active:false', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(deactivateProject(stub, 'proj-1'))
      const call = stub.calls[0]
      assert.equal(call?.url, '/projects/proj-1/active')
      assert.equal(call?.options.method, 'put')
    })

    it('serialises active:false in JSON body', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(deactivateProject(stub, 'proj-1'))
      const body = stub.calls[0]?.options.body as string
      assert.deepEqual(JSON.parse(body), { active: false })
    })
  })

  describe('getProjectRecordings', () => {
    it('fetches GET /projects/:projectId/recordings and unwraps items envelope', async () => {
      const stub = createStubApiClient(() => ({ items: [fakeRecording] }))
      const result = await promise(getProjectRecordings(stub, 'proj-1'))
      assert.deepEqual(result, [fakeRecording])
    })

    it('calls the correct URL', async () => {
      const stub = createStubApiClient(() => ({ items: [] }))
      await promise(getProjectRecordings(stub, 'proj-1'))
      assert.equal(stub.calls[0]?.url, '/projects/proj-1/recordings')
    })
  })

  describe('getProjectMembers', () => {
    it('fetches GET /projects/:projectId/members and unwraps items envelope', async () => {
      const memberPayload = { user: fakeUser, role: ProjectRole.Admin }
      const stub = createStubApiClient(() => ({
        items: [memberPayload],
      }))
      const result = await promise(getProjectMembers(stub, 'proj-1'))
      assert.deepEqual(result, [memberPayload])
    })

    it('calls the correct URL', async () => {
      const stub = createStubApiClient(() => ({ items: [] }))
      await promise(getProjectMembers(stub, 'proj-1'))
      assert.equal(stub.calls[0]?.url, '/projects/proj-1/members')
    })
  })

  describe('inviteProjectMember', () => {
    it('POSTs to /account/invite with email only', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(
        inviteProjectMember(stub, 'invitee@example.com', ProjectRole.Viewer)
      )

      const call = stub.calls[0]
      assert.equal(call?.url, '/account/invite')
      assert.equal(call?.options.method, 'post')
      assert.deepEqual(JSON.parse(call?.options.body as string), {
        email: 'invitee@example.com',
      })
    })
  })

  describe('updateProjectMemberRole', () => {
    it('PUTs to /projects/:projectId/members/:userId/role with role body', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(
        updateProjectMemberRole(stub, 'proj-1', 'user-2', ProjectRole.Admin)
      )

      const call = stub.calls[0]
      assert.equal(call?.url, '/projects/proj-1/members/user-2/role')
      assert.equal(call?.options.method, 'put')
      assert.deepEqual(JSON.parse(call?.options.body as string), {
        role: ProjectRole.Admin,
      })
    })
  })

  describe('removeProjectMember', () => {
    it('DELETEs to /projects/:projectId/members/:userId', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(removeProjectMember(stub, 'proj-1', 'user-2'))

      const call = stub.calls[0]
      assert.equal(call?.url, '/projects/proj-1/members/user-2')
      assert.equal(call?.options.method, 'delete')
    })
  })

  describe('getAccountSettings', () => {
    it('fetches GET /account/settings and returns the account summary', async () => {
      const stub = createStubApiClient(() => fakeAccountSettings)
      const result = await promise(getAccountSettings(stub))
      assert.deepEqual(result, fakeAccountSettings)
    })

    it('calls the correct URL', async () => {
      const stub = createStubApiClient(() => fakeAccountSettings)
      await promise(getAccountSettings(stub))
      assert.equal(stub.calls[0]?.url, '/account/settings')
    })
  })

  describe('renameAccount', () => {
    it('PUTs to /account/name with name in body', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(renameAccount(stub, 'Renamed Account'))
      const call = stub.calls[0]
      assert.equal(call?.url, '/account/name')
      assert.equal(call?.options.method, 'put')
    })

    it('serialises name in JSON body', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(renameAccount(stub, 'Renamed Account'))
      const body = stub.calls[0]?.options.body as string
      assert.deepEqual(JSON.parse(body), { name: 'Renamed Account' })
    })
  })

  describe('deleteAccount', () => {
    it('DELETEs /account', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(deleteAccount(stub))
      const call = stub.calls[0]
      assert.equal(call?.url, '/account')
      assert.equal(call?.options.method, 'delete')
    })
  })

  describe('getRecordingPrivacyPreset', () => {
    it('fetches GET /account/privacy and returns the preset', async () => {
      const stub = createStubApiClient(() => ({ value: 'strict' }))
      const result = await promise(getRecordingPrivacyPreset(stub))
      assert.deepEqual(result, { value: 'strict' })
    })

    it('calls the correct URL', async () => {
      const stub = createStubApiClient(() => ({ value: 'standard' }))
      await promise(getRecordingPrivacyPreset(stub))
      assert.equal(stub.calls[0]?.url, '/account/privacy')
    })
  })

  describe('updateRecordingPrivacyPreset', () => {
    it('PUTs to /account/privacy with preset in body', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(updateRecordingPrivacyPreset(stub, 'strict'))
      const call = stub.calls[0]
      assert.equal(call?.url, '/account/privacy')
      assert.equal(call?.options.method, 'put')
    })

    it('serialises preset in JSON body', async () => {
      const stub = createStubApiClient(() => undefined)
      await promise(updateRecordingPrivacyPreset(stub, 'off'))
      const body = stub.calls[0]?.options.body as string
      assert.deepEqual(JSON.parse(body), { value: 'off' })
    })
  })

  describe('error propagation', () => {
    it('propagates rejection from fetch', async () => {
      const apiError = { status: 401 }
      const client: ApiClient = {
        authStore: {} as never,
        fetch<R = unknown>(): FutureInstance<Error, R> {
          return futureReject(apiError as unknown as Error)
        },
        debug: () => () => undefined,
        wrapP<R>(_method: FutureInstance<unknown, R>): Promise<R> {
          return Promise.resolve(undefined as unknown as R)
        },
      }

      await new Promise<void>((resolveP, rejectP) => {
        getProjects(client).pipe(
          fork(err => {
            assert.deepEqual(err, apiError)
            resolveP()
          })(() => {
            rejectP(new Error('Expected rejection, got resolution'))
          })
        )
      })
    })
  })
})
