import assert from 'node:assert/strict'
import test from 'node:test'

import { fork, resolve, type FutureInstance } from 'fluture'

import type { AutobotStore } from '@repro/autobot-store'

import { makeWorkflowStore } from './workflow-fixture'

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise))
  })
}

const validRunPlan = [
  '## Readiness',
  'ready_to_proceed',
  '',
  '## Sequence Notes',
  '- Implement in one bounded pass.',
  '',
  '## Risk Notes',
  '- No high-risk signals.',
  '',
  '## Plan',
  '- Modify the selected issue files.',
].join('\n')

const validClassify = JSON.stringify(
  {
    issue_shapes: ['feature'],
    route: 'proceed',
    ready_to_proceed: true,
    why: ['Ready for planning.'],
    next: 'Continue to planning.',
  },
  null,
  2
)

const validRiskAssessment = [
  '## Risk Level',
  'standard',
  '',
  '## Risk Signals',
  '- none',
  '',
  '## Review Lanes',
  '- review-standard',
  '',
  '## Why',
  '- No elevated signals.',
].join('\n')

const noOpPlanningSessionRunner = (input: { phase?: string }) => {
  void input
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
}

const noOpArtifactReader = (input: { path: string }) => {
  if (input.path.endsWith('classify.json')) {
    return resolve(validClassify)
  }

  if (input.path.endsWith('risk-assessment.md')) {
    return resolve(validRiskAssessment)
  }

  return resolve(validRunPlan)
}

test('supervisor run-once hydrates planning artifacts from the default Linear issue loader', async t => {
  const loadLinearIssueCalls: Array<{ repoRoot: string; issueId: string }> = []

  t.mock.module('@repro/autobot-adapters', {
    namedExports: {
      discoverLinearIssues() {
        throw new Error('discoverLinearIssues should not be called')
      },
      resolveAutobotWorktreePaths(input: {
        repoRoot: string
        issueId: string
      }) {
        return {
          issue_id: input.issueId,
          branch: `autobot/${input.issueId}`,
          slug: input.issueId,
          worktree_path: `${input.repoRoot}/.autobot/worktrees/${input.issueId}`,
          archived_worktree_path: null,
        }
      },
      prepareAutobotWorktree(input: { repoRoot: string; issueId: string }) {
        return resolve({
          issue_id: input.issueId,
          branch: `autobot/${input.issueId}`,
          slug: input.issueId,
          worktree_path: `${input.repoRoot}/.autobot/worktrees/${input.issueId}`,
          archived_worktree_path: null,
        })
      },
      loadLinearIssue(input: { repoRoot: string; issueId: string }) {
        loadLinearIssueCalls.push(input)
        return resolve({
          issue_id: input.issueId,
          title: 'Hydrated queued item',
          url: 'https://linear.app/repro/issue/REP-400/hydrated-queued-item',
          state_name: 'Todo',
          state_type: 'unstarted',
          project: 'Engineering',
          labels: ['backend'],
          assignee: 'Gary',
        })
      },
    },
  })

  const { createAutobotServices } = (await import(
    '../services'
  )) as typeof import('../services')

  const fixture = makeWorkflowStore({
    configOverrides: {
      'supervisor.max-concurrency': 1,
    },
    items: [
      {
        issue_id: 'REP-400',
        title: 'Queued item',
        url: 'https://linear.app/repro/issue/REP-400/queued-item',
        state: 'queued',
        attempt: 1,
        priority: 2,
        owner: 'Gary',
        workspace: 'autobot',
        branch: 'autobot/REP-400',
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
        artifacts: [],
        events: [],
      },
    ],
  })

  const writes: Array<{ path: string; content: string }> = []
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input)
      return resolve(undefined)
    },
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore)
    },
    now() {
      return '2026-05-15T12:00:00Z'
    },
    randomId() {
      return 'run-400'
    },
  })

  const result = (await runFuture(
    services.handleInvocation({
      command_path: ['supervisor', 'run-once'],
      command: 'supervisor run-once',
      args: [],
      options: {
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
      },
    })
  )) as { kind: string; data: { tick?: { selected_issue_ids: string[] } } }

  assert.equal(result.kind, 'supervisor-status')
  assert.deepEqual(loadLinearIssueCalls, [
    {
      repoRoot: '/worktrees/autobot/.autobot/worktrees/REP-400',
      issueId: 'REP-400',
    },
  ])
  assert.ok(writes.length >= 4)
  assert.equal(
    writes.some(write => write.path.endsWith('/run-plan.md')),
    false
  )
  assert.match(writes[0]?.content ?? '', /Hydrated queued item/)
  assert.match(writes[0]?.content ?? '', /- Project: Engineering/)
  assert.match(writes[0]?.content ?? '', /- Labels: backend/)
  assert.match(writes[0]?.content ?? '', /- Assignee: Gary/)
})
