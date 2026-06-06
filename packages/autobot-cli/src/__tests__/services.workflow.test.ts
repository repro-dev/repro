import assert from 'node:assert/strict'
import test from 'node:test'

import { fork, resolve, type FutureInstance } from 'fluture'

import type { AutobotStore } from '@repro/autobot-store'

import { createAutobotServices } from '../services'
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
} from '../types'

import { makeWorkflowStore } from './workflow-fixture'

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
  overrides: Partial<AutobotGlobalOptions> = {}
): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(' '),
    args: [],
    options: makeOptions(overrides),
  }
}

test('workflow commands surface the Flowcraft delivery graph', async () => {
  const fixture = makeWorkflowStore()
  let openStoreCalls = 0
  const services = createAutobotServices({
    openStore() {
      openStoreCalls += 1
      return resolve(fixture.store as unknown as AutobotStore)
    },
  })

  const listResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(['supervisor', 'debug', 'workflow', 'list'])
    )
  )) as AutobotCommandResult

  assert.equal(listResult.kind, 'workflow-list')
  assert.equal(listResult.command, 'supervisor debug workflow list')
  assert.deepEqual(listResult.data.workflows[0]?.node_ids, [
    'claim',
    'preparing',
    'planning',
    'planning-failed',
    'developing',
    'testing',
    'reviewing',
    'review_fix',
    'review-loop',
    'reconcile',
    'escalated',
    'complete',
  ])

  const validationResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(['supervisor', 'debug', 'workflow', 'validate'])
    )
  )) as AutobotCommandResult

  assert.equal(validationResult.kind, 'workflow-validation')
  assert.equal(validationResult.data.validations[0]?.valid, true)
  assert.deepEqual(
    validationResult.data.validations[0]?.analysis.terminalNodeIds,
    ['planning-failed', 'escalated', 'complete']
  )

  const diagramResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(['supervisor', 'debug', 'workflow', 'diagram'])
    )
  )) as AutobotCommandResult

  assert.equal(diagramResult.kind, 'workflow-diagram')
  assert.match(diagramResult.data.diagram, /flowchart TD/)
  assert.equal(openStoreCalls, 0)
})

test('inspect resolves runs and flowcraft executions with persisted events', async () => {
  const fixture = makeWorkflowStore({
    currentRuns: {
      'REP-1154': {
        run_id: 'run-1154',
        issue_id: 'REP-1154',
        attempt: 1,
        state: 'claimed',
        flowcraft_execution_id: 'exec-1154',
        blueprint_id: 'autobot-deliver-issue',
        blueprint_version: '1.0.0',
        started_at: '2026-05-15T11:00:00Z',
        finished_at: null,
        worker_id: null,
        last_heartbeat_at: null,
        transport: null,
      },
    },
  })
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore)
    },
  })

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(['inspect']))
  ).catch(error => error)) as Error

  assert.match(result.message, /inspect requires a run id/)

  const byRun = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(['inspect']),
      args: ['run-1154'],
      command: 'inspect run-1154',
    })
  )) as AutobotCommandResult

  assert.equal(byRun.kind, 'flowcraft-inspect')
  assert.equal(byRun.data.lookup.kind, 'run')
  assert.equal(byRun.data.lookup.domain_events.length, 1)
  const executionMetadata = byRun.data.lookup.execution?.metadata as
    | {
        item_state: string
        workflow_status?: string
        loop?: { id: string; attempts?: number; continued?: boolean }
        phase_sequence?: string[]
        node_outputs?: Array<{ node_id: string }>
        planning_run_plan_valid?: boolean
        planning_run_plan_ready?: boolean
        planning_should_fail?: boolean
        planning_failure_reason?: string | null
        planning_artifacts?: Array<{ kind: string }>
        serialized_context?: string
      }
    | undefined
  assert.equal(executionMetadata?.item_state, 'completed')
  assert.equal(executionMetadata?.workflow_status, 'completed')
  assert.equal(executionMetadata?.planning_run_plan_valid, true)
  assert.equal(executionMetadata?.planning_run_plan_ready, true)
  assert.equal(executionMetadata?.planning_should_fail, false)
  assert.equal(executionMetadata?.planning_failure_reason, null)
  assert.ok(
    Array.isArray(executionMetadata?.planning_artifacts) &&
      executionMetadata?.planning_artifacts.some(
        (artifact: { kind: string }) => artifact.kind === 'run-plan'
      )
  )
  assert.equal(executionMetadata?.loop?.id, 'review-loop')
  assert.equal(executionMetadata?.loop?.attempts, 1)
  assert.equal(executionMetadata?.loop?.continued, false)
  assert.deepEqual(executionMetadata?.phase_sequence, [
    'claim',
    'preparing',
    'planning',
    'developing',
    'testing',
    'reviewing',
    'review-fix',
    'reconcile',
    'complete',
  ])
  assert.deepEqual(
    executionMetadata?.node_outputs?.map(output => output.node_id),
    [
      'claim',
      'preparing',
      'planning',
      'developing',
      'testing',
      'reviewing',
      'review_fix',
      'review-loop',
      'reconcile',
      'complete',
    ]
  )
  assert.match(
    executionMetadata?.serialized_context ?? '',
    /review_should_reconcile/
  )
  assert.ok(byRun.data.lookup.flowcraft_events.length >= 13)
  assert.ok(
    byRun.data.lookup.flowcraft_events.some(
      event => event.node_id === 'review-loop'
    )
  )
  assert.ok(
    byRun.data.lookup.flowcraft_events.some(
      event => event.node_id === 'complete'
    )
  )

  const byIssue = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(['inspect']),
      args: ['REP-1154'],
      command: 'inspect REP-1154',
    })
  )) as AutobotCommandResult

  assert.equal(byIssue.kind, 'flowcraft-inspect')
  assert.equal(byIssue.data.lookup.kind, 'run')
  assert.equal(byIssue.data.lookup.issue_id, 'REP-1154')
  assert.equal(byIssue.data.lookup.run?.run_id, 'run-1154')
})

test('inspect loads artifacts and domain events for runs without flowcraft execution ids', async () => {
  const fixture = makeWorkflowStore({
    artifacts: {
      'REP-1155': [
        {
          artifact_id: 1155,
          issue_id: 'REP-1155',
          run_id: 'run-1155',
          attempt: 1,
          kind: 'run-plan',
          path: '.autobot/runs/REP-1155/attempt-1/run-plan.md',
          description: 'Planning run plan',
          content_hash: 'hash-1155',
          supersedes_artifact_id: null,
          inherited_from_artifact_id: null,
          created_at: '2026-05-15T11:10:00Z',
        },
      ],
    },
  })
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore)
    },
  })

  const byRun = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(['inspect']),
      args: ['run-1155'],
      command: 'inspect run-1155',
    })
  )) as AutobotCommandResult

  assert.equal(byRun.kind, 'flowcraft-inspect')
  assert.equal(byRun.data.lookup.kind, 'run')
  assert.equal(byRun.data.lookup.artifacts.length, 1)
  assert.equal(byRun.data.lookup.artifacts[0]?.kind, 'run-plan')
  assert.equal(
    byRun.data.lookup.artifacts[0]?.path,
    '.autobot/runs/REP-1155/attempt-1/run-plan.md'
  )
  assert.equal(byRun.data.lookup.domain_events.length, 1)
  assert.equal(byRun.data.lookup.flowcraft_events.length, 0)
  assert.deepEqual(fixture.domainEventLookups[0], {
    issueId: 'REP-1155',
    options: { runId: 'run-1155' },
  })
})

test('inspect routes flowcraft execution ids directly to execution lookup', async () => {
  const fixture = makeWorkflowStore()
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore)
    },
  })

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(['inspect']),
      args: ['flowcraft-exec-1156'],
      command: 'inspect flowcraft-exec-1156',
    })
  )) as AutobotCommandResult

  assert.equal(result.kind, 'flowcraft-inspect')
  assert.equal(result.data.lookup.kind, 'flowcraft-execution')
  assert.deepEqual(fixture.runGetLookups, [])
  assert.deepEqual(fixture.flowcraftGetLookups, ['flowcraft-exec-1156'])
})
