import assert from 'node:assert/strict'
import test from 'node:test'

import { resolve } from 'fluture'

import { FlowRuntime } from '../flowcraft-runtime'
import { flowcraftWorkflows } from '../index'
import type {
  FlowcraftPhaseProgressRecord,
  FlowcraftWorkflowContext,
  FlowcraftWorkflowDependencies,
} from '../types'

function createPlanningDependencies(input: {
  progressRecords: FlowcraftPhaseProgressRecord[]
  events: string[]
  useWorker?: boolean
  runPlanContent?: string
}): FlowcraftWorkflowDependencies {
  return {
    autobotPlanning: {
      repo: { path: '/worktrees/autobot', state_dir: '.autobot' },
      item: {
        issue_id: 'REP-1225',
        title: 'Persist Flowcraft progress',
        url: 'https://linear.app/repro/issue/REP-1225',
        state: 'queued',
        attempt: 1,
        priority: 2,
        owner: 'Gary',
        workspace: 'autobot',
        branch: 'autobot/REP-1225',
        queued_at: '2026-05-23T21:00:00Z',
        started_at: null,
        updated_at: '2026-05-23T21:00:00Z',
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
      artifactDrafts: [],
      artifactPaths: {
        context:
          '/worktrees/autobot/.autobot/runs/REP-1225/attempt-1/context.md',
        testPlan:
          '/worktrees/autobot/.autobot/runs/REP-1225/attempt-1/test-plan.md',
        contract:
          '/worktrees/autobot/.autobot/runs/REP-1225/attempt-1/contract.md',
        runPlan:
          '/worktrees/autobot/.autobot/runs/REP-1225/attempt-1/run-plan.md',
        prompt: '/worktrees/autobot/.autobot/runs/REP-1225/attempt-1/prompt.md',
      },
      artifactWriter: () => resolve(undefined),
      artifactReader: () =>
        resolve(
          input.runPlanContent ??
            [
              '## Readiness',
              'ready_to_proceed',
              '',
              '## Sequence Notes',
              '- implement',
              '',
              '## Risk Notes',
              '- none',
              '',
              '## Plan',
              '- ship',
            ].join('\n')
        ),
      planningSessionRunner: () => {
        input.events.push('runner')
        return resolve({
          command: 'opencode',
          args: ['run'],
          started_at: '2026-05-23T21:00:02Z',
          finished_at: '2026-05-23T21:00:03Z',
          exit_code: 0,
          signal: null,
          stdout: 'ready',
          stderr: '',
        })
      },
      progressClock: () => '2026-05-23T21:00:01Z',
      progressWriter: record => {
        input.progressRecords.push(record)
        input.events.push(`progress:${record.phase}`)
        return resolve(undefined)
      },
      planningWorkerStarter: input.useWorker
        ? () => {
            input.events.push('worker')
            return resolve(undefined)
          }
        : undefined,
    },
  }
}

test('Flowcraft persists planning progress after run-plan validation', async () => {
  const progressRecords: FlowcraftPhaseProgressRecord[] = []
  const events: string[] = []
  const workflow = flowcraftWorkflows[0]
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({
    eventBus: { emit() {} },
    dependencies: createPlanningDependencies({ progressRecords, events }),
  })

  await workflow.flow.run(runtime, {
    issue_id: 'REP-1225',
    run_id: 'run-1225',
    execution_id: 'exec-1225',
    started_at: '2026-05-23T21:00:00Z',
    finished_at: '2026-05-23T21:00:04Z',
    review_attempts: 0,
    review_max_attempts: 3,
    review_requested: false,
    review_continue: false,
    review_should_reconcile: true,
    review_should_escalate: false,
    phase_history: [],
    transport: null,
  })

  assert.deepEqual(
    progressRecords.map(record => record.phase),
    ['preparing', 'planning']
  )
  assert.deepEqual(events.slice(0, 3), [
    'progress:preparing',
    'runner',
    'progress:planning',
  ])

  const [preparing, planning] = progressRecords
  assert.ok(preparing)
  assert.ok(planning)
  assert.equal(planning.issue_id, 'REP-1225')
  assert.equal(planning.run_id, 'run-1225')
  assert.equal(planning.execution_id, 'exec-1225')
  assert.equal(planning.workflow_id, 'autobot-deliver-issue')
  assert.equal(planning.workflow_version, '1.0.0')
  assert.equal(planning.state, 'planning')
  assert.equal(planning.event_type, 'workflow.phase.planned')
  assert.deepEqual(planning.recovery_commands, [
    'autobot-next status REP-1225 --json',
    'autobot-next logs REP-1225 --json',
  ])
  assert.match(planning.serialized_context, /REP-1225/)
  assert.equal(planning.node_output.node_id, 'planning')
  assert.equal(planning.node_output.state, 'planning')
})

test('Flowcraft starts durable planning workers and leaves workflow awaiting', async () => {
  const progressRecords: FlowcraftPhaseProgressRecord[] = []
  const events: string[] = []
  const workflow = flowcraftWorkflows[0]
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({
    eventBus: { emit() {} },
    dependencies: createPlanningDependencies({
      progressRecords,
      events,
      useWorker: true,
    }),
  })

  const result = await workflow.flow.run(runtime, {
    issue_id: 'REP-1225',
    run_id: 'run-1225',
    execution_id: 'exec-1225',
    started_at: '2026-05-23T21:00:00Z',
    finished_at: '2026-05-23T21:00:04Z',
    review_attempts: 0,
    review_max_attempts: 3,
    review_requested: false,
    review_continue: false,
    review_should_reconcile: true,
    review_should_escalate: false,
    phase_history: [],
    transport: null,
  })

  const context = result.context as unknown as Record<string, unknown>

  assert.equal(result.status, 'awaiting')
  assert.deepEqual(events, ['progress:preparing', 'worker'])
  assert.deepEqual(context['_awaitingNodeIds'], ['planning'])
  assert.deepEqual(context['_awaitingDetails'], {
    planning: { reason: 'planning_worker_running' },
  })
  assert.equal(context['_outputs.developing'], undefined)
  assert.equal(context['_outputs.planning'] !== undefined, true)
})

test('Flowcraft does not persist planned progress for invalid run plans', async () => {
  const progressRecords: FlowcraftPhaseProgressRecord[] = []
  const events: string[] = []
  const workflow = flowcraftWorkflows[0]
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({
    eventBus: { emit() {} },
    dependencies: createPlanningDependencies({
      progressRecords,
      events,
      runPlanContent: [
        '## Readiness',
        'ready_to_proceed',
        '',
        '## Sequence Notes',
        '- missing required sections',
      ].join('\n'),
    }),
  })

  await workflow.flow.run(runtime, {
    issue_id: 'REP-1225',
    run_id: 'run-1225',
    execution_id: 'exec-1225',
    started_at: '2026-05-23T21:00:00Z',
    finished_at: '2026-05-23T21:00:04Z',
    review_attempts: 0,
    review_max_attempts: 3,
    review_requested: false,
    review_continue: false,
    review_should_reconcile: true,
    review_should_escalate: false,
    phase_history: [],
    transport: null,
  })

  assert.deepEqual(
    progressRecords.map(record => record.phase),
    ['preparing']
  )
  assert.deepEqual(events, ['progress:preparing', 'runner'])
})
