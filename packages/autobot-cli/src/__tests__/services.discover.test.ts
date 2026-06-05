import assert from 'node:assert/strict'
import test from 'node:test'

import { fork, resolve, type FutureInstance } from 'fluture'

import type { AutobotStore } from '@repro/autobot-store'

import { createAutobotServices } from '../services'
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
  DiscoverCandidate,
} from '../types'

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise))
  })
}

function makeOptions(
  overrides: Partial<AutobotGlobalOptions> = {}
): AutobotGlobalOptions {
  return {
    json: false,
    repo: '/worktrees/autobot',
    state_dir: '.autobot',
    profile: null,
    quiet: false,
    verbose: false,
    color: false,
    dry_run: false,
    force: false,
    project: [],
    labels: [],
    priority: null,
    limit: null,
    ...overrides,
  }
}

function makeInvocation(
  command_path: string[],
  args: string[],
  overrides: Partial<AutobotGlobalOptions> = {}
): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(' '),
    args,
    options: makeOptions(overrides),
  }
}

function makeCandidate(
  issue_id: string,
  overrides: Partial<DiscoverCandidate> = {}
): DiscoverCandidate {
  return {
    issue_id,
    title: `Candidate ${issue_id}`,
    url: `https://linear.app/repro/issue/${issue_id}`,
    project: 'Engineering',
    labels: ['backend'],
    priority: 2,
    priority_label: 'High',
    status_name: 'Todo',
    state_type: 'unstarted',
    assignee: 'Gary',
    ...overrides,
  }
}

function makeStore(
  overrides: {
    configProject?: string | null
    queueDepth?: number | null
  } = {}
) {
  const configProject = overrides.configProject ?? null
  const queueDepth = overrides.queueDepth ?? null
  const listItemsCalls: Array<Record<string, unknown> | undefined> = []
  const store = {
    repo: {
      path: '/worktrees/autobot',
      state_dir: '.autobot',
    },
    close() {
      return resolve(undefined)
    },
    items: {
      get() {
        return resolve(null)
      },
      upsert() {
        return resolve(undefined)
      },
    },
    projections: {
      listItems(input?: { include_terminal?: boolean }) {
        listItemsCalls.push(input)
        return resolve([
          {
            issue_id: 'REP-200',
            title: 'Queued candidate',
            url: 'https://linear.app/repro/issue/REP-200',
            state: 'queued',
            attempt: 1,
            priority: 2,
            owner: 'Gary',
            workspace: 'autobot',
            branch: 'autobot/REP-200',
            queued_at: '2026-05-14T12:00:00Z',
            started_at: null,
            updated_at: '2026-05-14T12:00:00Z',
            last_event: null,
            last_error: null,
          },
        ])
      },
      getItemDetail() {
        return resolve(null)
      },
    },
    config: {
      setOverride() {
        return resolve(undefined)
      },
      getOverride(key: string) {
        if (key === 'supervisor.queue-depth') {
          return resolve(
            queueDepth !== null
              ? {
                  key,
                  value: queueDepth,
                  value_type: 'integer',
                  source: 'repo',
                  updated_at: '2026-05-14T12:00:00Z',
                }
              : null
          )
        }

        return resolve(
          key === 'discovery.projects' && configProject !== null
            ? {
                key,
                value: configProject,
                value_type: 'string',
                source: 'repo',
                updated_at: '2026-05-14T12:00:00Z',
              }
            : null
        )
      },
      listOverrides() {
        return resolve([])
      },
      deleteOverride() {
        return resolve(undefined)
      },
    },
    events: {
      append() {
        return resolve(undefined)
      },
      list() {
        return resolve([])
      },
    },
    runs: {
      upsert() {
        return resolve(undefined)
      },
      getCurrent() {
        return resolve(null)
      },
    },
    workers: {
      upsert() {
        return resolve(undefined)
      },
      list() {
        return resolve([])
      },
    },
    artifacts: {
      record() {
        return resolve(undefined)
      },
      list() {
        return resolve([])
      },
    },
    flowcraft: {
      recordExecution() {
        return resolve(undefined)
      },
      listExecutions() {
        return resolve([])
      },
      recordEvent() {
        return resolve(undefined)
      },
      listEvents() {
        return resolve([])
      },
    },
  }

  return {
    store: store as unknown as AutobotStore,
    listItemsCalls,
  }
}

test('discover returns candidates and local exclusion reasons', async () => {
  const fixture = makeStore()
  const received: Array<{
    repo: { path: string; state_dir: string }
    projects: string[]
    scanLimit: number
  }> = []

  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store)
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number])
      return resolve([
        makeCandidate('REP-200'),
        makeCandidate('REP-201', { labels: ['backend', 'infra'] }),
        makeCandidate('REP-202', { labels: ['backend', 'infra'] }),
        makeCandidate('REP-203', { labels: ['docs'] }),
      ])
    },
  })

  const result = (await runFuture(
    services.handleInvocation(
      makeInvocation(['discover'], ['Engineering'], {
        project: ['Engineering'],
        labels: ['backend'],
        priority: 'high',
        limit: 1,
      })
    )
  )) as AutobotCommandResult

  assert.equal(result.kind, 'discover')
  assert.equal(result.command, 'autobot-next discover')
  assert.deepStrictEqual(result.data.filters.limit, 1)
  assert.deepStrictEqual(result.data.filters.scan_limit, 100)
  assert.deepStrictEqual(received, [
    {
      repo: {
        path: '/worktrees/autobot',
        state_dir: '.autobot',
      },
      projects: ['Engineering'],
      scanLimit: 100,
    },
  ])
  assert.deepStrictEqual(result.data.issue_ids, ['REP-201'])
  assert.deepStrictEqual(result.data.candidates, [
    makeCandidate('REP-201', { labels: ['backend', 'infra'] }),
  ])
  assert.deepStrictEqual(
    result.data.exclusions.map(entry => entry.reason),
    ['local-non-terminal', 'label-filter', 'limit-reached']
  )
  assert.equal(fixture.listItemsCalls.length, 1)
  assert.deepStrictEqual(fixture.listItemsCalls[0], undefined)
})

test('discover scans all projects when no flags or config are provided', async () => {
  const fixture = makeStore()
  const received: Array<{
    repo: { path: string; state_dir: string }
    projects: string[]
    scanLimit: number
  }> = []
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store)
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number])
      return resolve([])
    },
  })

  const result = (await runFuture(
    services.handleInvocation(
      makeInvocation(['discover'], [], {
        project: [],
      })
    )
  )) as AutobotCommandResult

  assert.equal(result.kind, 'discover')
  assert.deepStrictEqual(received, [
    {
      repo: {
        path: '/worktrees/autobot',
        state_dir: '.autobot',
      },
      projects: [],
      scanLimit: 100,
    },
  ])
  assert.deepStrictEqual(result.data.projects, [])
})

test('discover falls back to configured project allowlists', async () => {
  const fixture = makeStore({ configProject: 'Engineering, Platform' })
  const received: Array<{ projects: string[] }> = []
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store)
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number])
      return resolve([])
    },
  })

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(['discover'], []))
  )) as AutobotCommandResult

  assert.equal(result.kind, 'discover')
  assert.deepStrictEqual(received, [
    {
      repo: {
        path: '/worktrees/autobot',
        state_dir: '.autobot',
      },
      projects: ['Engineering', 'Platform'],
      scanLimit: 100,
    },
  ])
  assert.deepStrictEqual(result.data.projects, ['Engineering', 'Platform'])
})

test('discover defaults to the configured queue depth when limit is omitted', async () => {
  const fixture = makeStore({ queueDepth: 2 })
  const received: Array<{
    repo: { path: string; state_dir: string }
    projects: string[]
    scanLimit: number
  }> = []
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store)
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number])
      return resolve([
        makeCandidate('REP-201'),
        makeCandidate('REP-202'),
        makeCandidate('REP-203'),
      ])
    },
  })

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(['discover'], []))
  )) as AutobotCommandResult

  assert.equal(result.kind, 'discover')
  assert.deepStrictEqual(result.data.filters.limit, 2)
  assert.deepStrictEqual(result.data.filters.scan_limit, 100)
  assert.deepStrictEqual(received, [
    {
      repo: {
        path: '/worktrees/autobot',
        state_dir: '.autobot',
      },
      projects: [],
      scanLimit: 100,
    },
  ])
  assert.deepStrictEqual(result.data.issue_ids, ['REP-201', 'REP-202'])
  assert.deepStrictEqual(result.data.candidates, [
    makeCandidate('REP-201'),
    makeCandidate('REP-202'),
  ])
  assert.deepStrictEqual(
    result.data.exclusions.map(entry => [
      entry.issue_id,
      entry.reason,
      entry.details,
    ]),
    [['REP-203', 'limit-reached', { limit: 2 }]]
  )
})

test('discover project flags override configured allowlists', async () => {
  const fixture = makeStore({ configProject: 'Engineering, Platform' })
  const received: Array<{ projects: string[] }> = []
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store)
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number])
      return resolve([])
    },
  })

  const result = (await runFuture(
    services.handleInvocation(
      makeInvocation(['discover'], [], {
        project: ['Security', 'Billing'],
      })
    )
  )) as AutobotCommandResult

  assert.equal(result.kind, 'discover')
  assert.deepStrictEqual(received, [
    {
      repo: {
        path: '/worktrees/autobot',
        state_dir: '.autobot',
      },
      projects: ['Security', 'Billing'],
      scanLimit: 100,
    },
  ])
  assert.deepStrictEqual(result.data.projects, ['Security', 'Billing'])
})

test('discover expands the scan limit when an explicit limit exceeds the default scan size', async () => {
  const fixture = makeStore()
  const received: Array<{
    repo: { path: string; state_dir: string }
    projects: string[]
    scanLimit: number
  }> = []
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store)
    },
    discoverIssues(input) {
      received.push(input as unknown as (typeof received)[number])
      return resolve([])
    },
  })

  const result = (await runFuture(
    services.handleInvocation(
      makeInvocation(['discover'], [], {
        limit: 150,
      })
    )
  )) as AutobotCommandResult

  assert.equal(result.kind, 'discover')
  assert.deepStrictEqual(result.data.filters.limit, 150)
  assert.deepStrictEqual(result.data.filters.scan_limit, 150)
  assert.deepStrictEqual(received, [
    {
      repo: {
        path: '/worktrees/autobot',
        state_dir: '.autobot',
      },
      projects: [],
      scanLimit: 150,
    },
  ])
})
