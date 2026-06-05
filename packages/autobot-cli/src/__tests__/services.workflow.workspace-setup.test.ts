import { fork, reject, resolve, type FutureInstance } from 'fluture'
import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkspaceSetupResult } from '@repro/autobot-adapters'
import type { AutobotStore } from '@repro/autobot-store'

import { createAutobotServices } from '../services'
import type { AutobotGlobalOptions, AutobotInvocation } from '../types'
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

function makeInvocation(command_path: string[]): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(' '),
    args: [],
    options: makeOptions(),
  }
}

function queuedItem(issueId: string) {
  return {
    issue_id: issueId,
    title: `Queued ${issueId}`,
    url: `https://linear.app/repro/issue/${issueId}/queued`,
    state: 'queued' as const,
    attempt: 1,
    priority: 2,
    owner: 'Gary',
    workspace: 'autobot',
    branch: `autobot/${issueId}`,
    queued_at: '2026-05-15T09:00:00Z',
    started_at: null,
    updated_at: '2026-05-15T09:00:00Z',
    last_event: null,
    last_error: null,
    recovery_commands: [],
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    artifacts: [] as [],
    events: [] as [],
  }
}

const validRunPlan = [
  '## Readiness',
  'ready_to_proceed',
  '',
  '## Sequence Notes',
  '- Continue.',
  '',
  '## Risk Notes',
  '- No risks.',
  '',
  '## Plan',
  '- Deliver.',
].join('\n')

const prepareWorktree = (input: { repoRoot: string; issueId: string }) =>
  resolve({
    issue_id: input.issueId,
    branch: `autobot/${input.issueId}`,
    slug: input.issueId,
    worktree_path: `${input.repoRoot}/.autobot/worktrees/${input.issueId}`,
    archived_worktree_path: null,
  })

function setupResult(input: {
  issueId: string
  runId: string
  attempt: number
  workspacePath: string
}): WorkspaceSetupResult {
  return {
    issue_id: input.issueId,
    run_id: input.runId,
    attempt: input.attempt,
    workspace_path: input.workspacePath,
    status: 'succeeded',
    started_at: '2026-05-15T12:00:00Z',
    finished_at: '2026-05-15T12:00:01Z',
    steps: [
      {
        name: 'direnv',
        status: 'skipped',
        started_at: '2026-05-15T12:00:00Z',
        finished_at: '2026-05-15T12:00:00Z',
        skip_reason: 'direnv prerequisites not met',
      },
    ],
    summary_artifact_path: `${input.workspacePath}/.autobot/runs/${input.issueId}/attempt-${input.attempt}/workspace-setup.json`,
  }
}

test('supervisor run-once records workspace setup before planning artifacts', async () => {
  const fixture = makeWorkflowStore({ items: [queuedItem('REP-1234')] })
  let planningCalls = 0
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => '2026-05-15T12:00:00Z',
    randomId: () => 'run-1234',
    prepareWorktree,
    setupWorkspace(input, dependencies) {
      dependencies?.onProgress?.({
        event: 'started',
        step: 'workspace-setup',
        occurred_at: '2026-05-15T12:00:00Z',
      })
      dependencies?.onProgress?.({
        event: 'step_skipped',
        step: 'direnv',
        occurred_at: '2026-05-15T12:00:00Z',
        data: { skip_reason: 'direnv prerequisites not met' },
      })
      dependencies?.onProgress?.({
        event: 'succeeded',
        step: 'workspace-setup',
        occurred_at: '2026-05-15T12:00:01Z',
      })
      return resolve(setupResult(input))
    },
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    loadLinearIssue: () => resolve(null),
    planningSessionRunner() {
      planningCalls += 1
      return resolve({
        command: 'opencode',
        args: ['run'],
        started_at: '2026-05-15T12:00:01Z',
        finished_at: '2026-05-15T12:00:02Z',
        exit_code: 0,
        signal: null,
        stdout: validRunPlan,
        stderr: '',
      })
    },
  })

  await runFuture(
    services.handleInvocation(makeInvocation(['supervisor', 'run-once']))
  )

  const eventTypes = fixture.domainEvents.map(event => event.type)
  assert.ok(eventTypes.includes('workflow.worktree.started'))
  assert.ok(eventTypes.includes('workflow.worktree.succeeded'))
  assert.ok(eventTypes.includes('workflow.workspace_setup.started'))
  assert.ok(eventTypes.includes('workflow.workspace_setup.step_skipped'))
  assert.ok(eventTypes.includes('workflow.phase.succeeded'))
  const artifactKinds = fixture.artifactRecords.map(artifact => artifact.kind)
  assert.equal(artifactKinds[0], 'summary')
  assert.ok(artifactKinds.includes('context'))
  assert.ok(
    fixture.artifactRecords.some(
      artifact =>
        artifact.kind === 'summary' &&
        artifact.path ===
          '.autobot/runs/REP-1234/attempt-1/workspace-setup.json'
    )
  )
  assert.equal(planningCalls, 1)
})

test('supervisor run-once fails from preparing when workspace setup fails', async () => {
  const fixture = makeWorkflowStore({ items: [queuedItem('REP-1234')] })
  let planningCalls = 0
  const setupError = {
    code: 'AUTOBOT-WORKSPACE-BOOTSTRAP-FAILED',
    message: 'Workspace setup failed during dependencies',
    what_failed: 'workspace setup dependencies',
    likely_cause: 'lockfile mismatch',
    recovery_commands: ['pnpm install --frozen-lockfile'],
    details: { step: 'dependencies' },
  }
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => '2026-05-15T12:00:00Z',
    randomId: () => 'run-1234',
    prepareWorktree,
    setupWorkspace(_input, dependencies) {
      dependencies?.onProgress?.({
        event: 'step_failed',
        step: 'dependencies',
        occurred_at: '2026-05-15T12:00:00Z',
        data: setupError,
      })
      dependencies?.onProgress?.({
        event: 'failed',
        step: 'workspace-setup',
        occurred_at: '2026-05-15T12:00:00Z',
        data: setupError,
      })
      return reject(setupError)
    },
    artifactWriter: () => resolve(undefined),
    artifactReader: () => resolve(validRunPlan),
    loadLinearIssue: () => resolve(null),
    planningSessionRunner() {
      planningCalls += 1
      return resolve({
        command: 'opencode',
        args: ['run'],
        started_at: '2026-05-15T12:00:01Z',
        finished_at: '2026-05-15T12:00:02Z',
        exit_code: 0,
        signal: null,
        stdout: validRunPlan,
        stderr: '',
      })
    },
  })

  await runFuture(
    services.handleInvocation(makeInvocation(['supervisor', 'run-once']))
  )

  assert.equal(planningCalls, 0)
  const setupStepFailedEvent = fixture.domainEvents.find(
    event => event.type === 'workflow.workspace_setup.step_failed'
  )
  assert.ok(setupStepFailedEvent)
  assert.deepEqual(
    (setupStepFailedEvent.data as { error?: unknown }).error,
    setupError
  )
  const setupFailedEvent = fixture.domainEvents.find(
    event => event.type === 'workflow.workspace_setup.failed'
  )
  assert.ok(setupFailedEvent)
  assert.deepEqual(
    (setupFailedEvent.data as { error?: unknown }).error,
    setupError
  )
  assert.ok(
    fixture.domainEvents.some(event => event.type === 'workflow.phase.failed')
  )
  const failedItem = fixture.itemUpserts.at(-1)
  assert.equal(failedItem?.state, 'failed')
  assert.deepEqual(failedItem?.recovery_commands, [
    'pnpm install --frozen-lockfile',
  ])
})
