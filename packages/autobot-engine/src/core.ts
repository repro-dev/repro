import type {
  EffectRequest,
  ProcessQueueResult,
  QueuePayload,
  QueueSummary,
  TaskInput,
  TaskObservation,
  TaskPlan,
  TaskState,
  TransitionDecision,
} from './types'

const ACTIVE_STATES = new Set<TaskState>([
  'claimed',
  'preparing',
  'planning',
  'developing',
  'testing',
  'reviewing',
  'releasing',
  'running',
  'reconciling',
])
const RECOVERY_STATES = new Set<TaskState>(['failed', 'error', 'stale'])
const TERMINAL_STATES = new Set<TaskState>(['released', 'canceled'])
const TERMINAL_LINEAR_STATE_TYPES = new Set(['canceled', 'closed'])
const SUCCESS_LINEAR_STATE_TYPES = new Set(['completed', 'done'])

const STATE_PRIORITY: Record<string, number> = {
  queued: 0,
  claimed: 1,
  preparing: 2,
  planning: 3,
  developing: 4,
  testing: 5,
  reviewing: 6,
  releasing: 7,
  running: 4,
  reconciling: 6,
  failed: 8,
  error: 8,
  stale: 8,
  released: 9,
  canceled: 10,
}

function asMapping(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function items(payload: QueuePayload): TaskInput[] {
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.claims)
    ? payload.claims
    : []

  return rawItems.filter(
    (item): item is TaskInput =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
  )
}

export function taskId(item: TaskInput): string {
  return String(item.issue_identifier ?? item.identifier ?? '')
}

export function claimState(item: TaskInput): TaskState {
  return String(item.claim_state ?? '') as TaskState
}

export function stateRank(state: TaskState): number {
  return STATE_PRIORITY[state] ?? 99
}

function phaseEffect(
  issueIdentifier: string,
  kind: EffectRequest['kind']
): EffectRequest {
  return {
    kind,
    issueIdentifier,
    phase: 'delivery',
    ...(kind === 'claim' || kind === 'prepare-worktree'
      ? { claimedBy: 'autobot-engine' }
      : {}),
  } as EffectRequest
}

export function trackedTasks(payload: QueuePayload): TaskInput[] {
  return items(payload)
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rankDelta =
        stateRank(claimState(left.item)) - stateRank(claimState(right.item))
      if (rankDelta !== 0) return rankDelta

      const idDelta = taskId(left.item).localeCompare(taskId(right.item))
      if (idDelta !== 0) return idDelta

      return left.index - right.index
    })
    .map(({ item }) => item)
}

function queueSummary(trackedItems: TaskInput[]): QueueSummary {
  const counts: Record<string, number> = {}

  for (const item of trackedItems) {
    const state = claimState(item)
    counts[state] = (counts[state] ?? 0) + 1
  }

  return {
    total: trackedItems.length,
    claimed: counts.claimed ?? 0,
    running:
      (counts.preparing ?? 0) +
      (counts.planning ?? 0) +
      (counts.developing ?? 0) +
      (counts.testing ?? 0) +
      (counts.reviewing ?? 0) +
      (counts.releasing ?? 0) +
      (counts.running ?? 0) +
      (counts.reconciling ?? 0),
    reconciling: counts.reconciling ?? 0,
    recovery: (counts.failed ?? 0) + (counts.error ?? 0) + (counts.stale ?? 0),
    terminal: (counts.released ?? 0) + (counts.canceled ?? 0),
    by_state: counts,
    selected_issue_identifier: '',
    selected_state: '',
    allow_recovery: true,
  }
}

export function selectWork(
  payload: QueuePayload,
  options: { allowRecovery?: boolean } = {}
): { selected: TaskInput | null; summary: QueueSummary } {
  const allowRecovery = options.allowRecovery ?? true
  const queuedItems = items(payload)

  let selected: TaskInput | null = null
  for (const state of [
    'queued',
    'claimed',
    'preparing',
    'planning',
    'developing',
    'testing',
    'reviewing',
    'releasing',
    'running',
    'reconciling',
  ] as const) {
    selected = queuedItems.find(item => claimState(item) === state) ?? null
    if (selected !== null) break
  }

  if (selected === null && allowRecovery) {
    selected =
      queuedItems.find(item => RECOVERY_STATES.has(claimState(item))) ?? null
  }

  const summary = queueSummary(queuedItems)
  summary.selected_issue_identifier = selected ? taskId(selected) : ''
  summary.selected_state = selected ? String(claimState(selected)) : ''
  summary.allow_recovery = allowRecovery

  return { selected, summary }
}

function asBool(value: unknown): boolean {
  return Boolean(value)
}

function asInt(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function rolloutStatusState(value: unknown): string {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
    ? [value]
    : []
  let seenPending = false

  for (const entry of entries) {
    const item = asMapping(entry)
    const checkRun = asMapping(item.checkRun ?? item.check_run)
    const state = String(
      item.state ??
        item.conclusion ??
        item.status ??
        checkRun.state ??
        checkRun.conclusion ??
        ''
    ).toUpperCase()

    if (
      ['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(state)
    ) {
      return ['FAILURE', 'FAILED'].includes(state) ? 'FAILURE' : 'ERROR'
    }

    if (['PENDING', 'IN_PROGRESS', 'QUEUED'].includes(state)) {
      seenPending = true
    }
  }

  return seenPending ? 'PENDING' : ''
}

function resolveMaxAttempts(
  payload: TaskInput,
  fallbackMaxAttempts = 0
): number {
  const candidates = [payload.max_attempts, fallbackMaxAttempts]
  for (const candidate of candidates) {
    const parsed = asInt(candidate)
    if (parsed > 0) return parsed
  }
  return 0
}

export function observeTask(
  item: TaskInput,
  fallbackMaxAttempts = 0
): TaskObservation {
  const linear = asMapping(item.linear)
  const linearItem = asMapping(linear.item)
  const linearStatus = asMapping(linear.status ?? linearItem.status)
  const linearIssue = asMapping(linear.issue ?? linearItem.issue)
  const pr = asMapping(item.pr)

  const linearStateType = String(
    linear.state_type ??
      linear.type ??
      linearStatus.type ??
      linearIssue.state_type ??
      linearIssue.stateType ??
      ''
  ).toLowerCase()
  const linearStateName = String(
    linear.state_name ??
      linear.name ??
      linearStatus.name ??
      linearIssue.state_name ??
      linearIssue.stateName ??
      ''
  ).toLowerCase()

  const prState = String(pr.state ?? pr.State ?? '').toUpperCase()
  const mergeStateStatus = String(
    pr.merge_state_status ?? pr.mergeStateStatus ?? ''
  ).toUpperCase()
  const reviewDecision = String(
    pr.review_decision ?? pr.reviewDecision ?? ''
  ).toUpperCase()
  const statusState = rolloutStatusState(
    pr.status_check_rollup ?? pr.statusCheckRollup
  )

  return {
    workspaceExists: asBool(item.workspace_exists),
    workspaceDirty: asBool(item.workspace_dirty),
    mergeConflictCount: asInt(item.merge_conflict_count),
    linearStateType,
    linearStateName,
    prState,
    mergeStateStatus,
    reviewDecision,
    statusState,
    attemptCount: asInt(item.attempt_count),
    maxAttempts: resolveMaxAttempts(item, fallbackMaxAttempts),
    claimState: claimState(item),
  }
}

export interface RecoveryDecision {
  action: 'release' | 'reconcile' | 'cancel' | 'retry' | 'stop' | 'continue'
  reason: string
  fetch_main: boolean
  cleanup_eligible: boolean
}

export function decideRecovery(
  payload: TaskInput & TaskObservation
): RecoveryDecision {
  const claim = String(payload.claimState ?? payload.claim_state ?? '')
  const linear = asMapping(payload.linear)
  const linearItem = asMapping(linear.item)
  const linearStatus = asMapping(linear.status ?? linearItem.status)
  const linearIssue = asMapping(linear.issue ?? linearItem.issue)
  const pr = asMapping(payload.pr)

  const linearStateType = String(
    payload.linearStateType ??
      linear.state_type ??
      linear.type ??
      linearStatus.type ??
      linearIssue.state_type ??
      linearIssue.stateType ??
      ''
  ).toLowerCase()
  const linearStateName = String(
    payload.linearStateName ??
      linear.state_name ??
      linear.name ??
      linearStatus.name ??
      linearIssue.state_name ??
      linearIssue.stateName ??
      ''
  ).toLowerCase()
  const prState = String(
    payload.prState ?? pr.state ?? pr.State ?? ''
  ).toUpperCase()
  const mergeStateStatus = String(
    payload.mergeStateStatus ??
      pr.merge_state_status ??
      pr.mergeStateStatus ??
      ''
  ).toUpperCase()
  const reviewDecision = String(
    payload.reviewDecision ?? pr.review_decision ?? pr.reviewDecision ?? ''
  ).toUpperCase()
  const statusState = String(
    payload.statusState ??
      rolloutStatusState(pr.status_check_rollup ?? pr.statusCheckRollup)
  ).toUpperCase()
  const mergeConflictCount = asInt(payload.mergeConflictCount)
  const workspaceExists = asBool(payload.workspaceExists)
  const workspaceDirty = asBool(payload.workspaceDirty)
  const attemptCount = asInt(payload.attemptCount)
  const maxAttempts = asInt(payload.maxAttempts)

  if (
    TERMINAL_LINEAR_STATE_TYPES.has(linearStateType) ||
    TERMINAL_LINEAR_STATE_TYPES.has(linearStateName)
  ) {
    return {
      action: 'cancel',
      reason: `linear-${linearStateType || linearStateName}`,
      fetch_main: false,
      cleanup_eligible: false,
    }
  }

  if (
    SUCCESS_LINEAR_STATE_TYPES.has(linearStateType) ||
    SUCCESS_LINEAR_STATE_TYPES.has(linearStateName)
  ) {
    return {
      action: 'release',
      reason: `linear-${linearStateType || linearStateName}`,
      fetch_main: true,
      cleanup_eligible: true,
    }
  }

  if (prState === 'MERGED' || mergeStateStatus === 'MERGED') {
    return {
      action: 'release',
      reason: `pr-${prState || mergeStateStatus}`,
      fetch_main: true,
      cleanup_eligible: true,
    }
  }

  if (
    mergeConflictCount > 0 ||
    reviewDecision === 'CHANGES_REQUESTED' ||
    statusState === 'FAILURE' ||
    statusState === 'ERROR'
  ) {
    return {
      action: 'reconcile',
      reason: 'pr-ci-review-conflict',
      fetch_main: false,
      cleanup_eligible: false,
    }
  }

  if (!workspaceExists) {
    if (maxAttempts <= 0 || attemptCount < maxAttempts) {
      return {
        action: 'retry',
        reason: 'missing-workspace',
        fetch_main: false,
        cleanup_eligible: false,
      }
    }
    return {
      action: 'stop',
      reason: 'missing-workspace-exhausted',
      fetch_main: false,
      cleanup_eligible: false,
    }
  }

  if (RECOVERY_STATES.has(claim)) {
    if (maxAttempts <= 0 || attemptCount < maxAttempts) {
      return {
        action: 'retry',
        reason: `claim-${claim}`,
        fetch_main: false,
        cleanup_eligible: false,
      }
    }
    return {
      action: 'stop',
      reason: `claim-${claim}-exhausted`,
      fetch_main: false,
      cleanup_eligible: false,
    }
  }

  if (workspaceDirty && ACTIVE_STATES.has(claim)) {
    return {
      action: 'reconcile',
      reason: 'workspace-dirty',
      fetch_main: false,
      cleanup_eligible: false,
    }
  }

  return {
    action: 'continue',
    reason: 'no-recovery-needed',
    fetch_main: false,
    cleanup_eligible: false,
  }
}

function recoveryEffect(
  item: TaskInput,
  observation: TaskObservation,
  decision: RecoveryDecision
): EffectRequest {
  return {
    kind: 'recover',
    issueIdentifier: taskId(item),
    action: decision.action,
    reason: decision.reason,
    fetchMain: decision.fetch_main,
    cleanupEligible: decision.cleanup_eligible,
    phase: 'delivery',
    attemptCount: observation.attemptCount,
  }
}

function phaseEffectsForState(
  currentState: TaskState,
  issueIdentifier: string
): { nextState: TaskState; effects: EffectRequest[]; reason: string } | null {
  switch (currentState) {
    case 'queued':
      return {
        nextState: 'preparing',
        reason: 'queued-task-needs-claim-and-setup',
        effects: [
          phaseEffect(issueIdentifier, 'claim'),
          phaseEffect(issueIdentifier, 'prepare-worktree'),
        ],
      }
    case 'claimed':
      return {
        nextState: 'preparing',
        reason: 'claimed-task-needs-worktree-preparation',
        effects: [phaseEffect(issueIdentifier, 'prepare-worktree')],
      }
    case 'preparing':
      return {
        nextState: 'planning',
        reason: 'preparing-task-needs-context-preparation',
        effects: [phaseEffect(issueIdentifier, 'prepare-context')],
      }
    case 'planning':
      return {
        nextState: 'developing',
        reason: 'planning-task-needs-development',
        effects: [phaseEffect(issueIdentifier, 'plan')],
      }
    case 'developing':
    case 'running':
      return {
        nextState: 'testing',
        reason: 'developing-task-needs-testing',
        effects: [phaseEffect(issueIdentifier, 'develop')],
      }
    case 'testing':
      return {
        nextState: 'reviewing',
        reason: 'testing-task-needs-review',
        effects: [phaseEffect(issueIdentifier, 'test')],
      }
    case 'reviewing':
    case 'reconciling':
      return {
        nextState: 'releasing',
        reason: 'reviewing-task-needs-release',
        effects: [phaseEffect(issueIdentifier, 'review')],
      }
    case 'releasing':
      return {
        nextState: 'released',
        reason: 'releasing-task-completes-release',
        effects: [phaseEffect(issueIdentifier, 'release')],
      }
    default:
      return null
  }
}

export function transition(
  item: TaskInput,
  observation: TaskObservation
): TransitionDecision {
  const currentState = claimState(item)
  const issueIdentifier = taskId(item)

  if (
    currentState !== 'queued' &&
    (ACTIVE_STATES.has(currentState) || RECOVERY_STATES.has(currentState))
  ) {
    const recovery = decideRecovery({
      ...item,
      ...observation,
      claimState: currentState,
    })

    if (recovery.action !== 'continue') {
      const nextState: TaskState | null =
        recovery.action === 'release'
          ? 'released'
          : recovery.action === 'cancel'
          ? 'canceled'
          : recovery.action === 'retry'
          ? 'queued'
          : recovery.action === 'reconcile'
          ? 'reconciling'
          : recovery.action === 'stop'
          ? currentState
          : null

      return {
        taskId: issueIdentifier,
        currentState,
        nextState,
        reason: recovery.reason,
        effects: [recoveryEffect(item, observation, recovery)],
      }
    }
  }

  const phaseTransition = phaseEffectsForState(currentState, issueIdentifier)
  if (phaseTransition !== null) {
    return {
      taskId: issueIdentifier,
      currentState,
      nextState: phaseTransition.nextState,
      reason: phaseTransition.reason,
      effects: phaseTransition.effects,
    }
  }

  if (TERMINAL_STATES.has(currentState)) {
    return {
      taskId: issueIdentifier,
      currentState,
      nextState: currentState,
      reason: 'terminal-state-no-op',
      effects: [
        {
          kind: 'noop',
          issueIdentifier,
          reason: 'terminal-state',
        },
      ],
    }
  }

  return {
    taskId: issueIdentifier,
    currentState,
    nextState: null,
    reason: 'unrecognized-state-no-op',
    effects: [
      {
        kind: 'noop',
        issueIdentifier,
        reason: 'unrecognized-state',
      },
    ],
  }
}

export function processQueue(payload: QueuePayload): ProcessQueueResult {
  const selected = selectWork(payload, {
    allowRecovery: payload.allow_recovery !== false,
  })
  const fallbackMaxAttempts = asInt(
    payload.max_attempts ?? payload.config?.max_attempts
  )
  const plannedTasks = trackedTasks(payload).map(item => {
    const observation = observeTask(item, fallbackMaxAttempts)
    return {
      item,
      observation,
      decision: transition(item, observation),
    } satisfies TaskPlan
  })

  return {
    items: plannedTasks,
    summary: selected.summary,
    selected_work: selected.selected,
    generated_at: nowIso(),
  }
}
