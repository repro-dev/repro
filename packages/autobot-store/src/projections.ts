import type {
  ArtifactRef,
  DomainEvent,
  ItemDetail,
  LinearIssueRef,
  ItemSummary,
  RunSummary,
  TransportCorrelation,
  WorkerSummary,
} from '@repro/autobot-core'
import { Future, type FutureInstance } from 'fluture'
import type { Kysely, Selectable } from 'kysely'

import { decodeJsonArray, decodeJsonNullable } from './json'
import type { AutobotSchema } from './schema'

type Db = Kysely<AutobotSchema>

export interface ItemStateFilter {
  include_terminal?: boolean
}

export interface ItemProjections {
  listItems(input?: ItemStateFilter): FutureInstance<unknown, ItemSummary[]>
  getNextRunnableItem(): FutureInstance<unknown, ItemSummary | null>
  getItemDetail(
    issueId: string,
    options?: ItemDetailOptions
  ): FutureInstance<unknown, ItemDetail | null>
}

export interface ItemDetailOptions {
  eventLimit?: number
}

function fromItemRow(row: Selectable<AutobotSchema['items']>): ItemSummary {
  return {
    issue_id: row.issue_id,
    title: row.title,
    url: row.url,
    state: row.state as ItemSummary['state'],
    attempt: row.attempt,
    priority: row.priority,
    owner: row.owner,
    workspace: row.workspace,
    branch: row.branch,
    queued_at: row.queued_at,
    started_at: row.started_at,
    updated_at: row.updated_at,
    last_event: row.last_event,
    last_error: decodeJsonNullable(row.last_error_json),
  }
}

function fromRunRow(row: Selectable<AutobotSchema['runs']>): RunSummary {
  return {
    run_id: row.run_id,
    issue_id: row.issue_id,
    attempt: row.attempt,
    state: row.state as RunSummary['state'],
    flowcraft_execution_id: row.flowcraft_execution_id,
    blueprint_id: row.blueprint_id,
    blueprint_version: row.blueprint_version,
    started_at: row.started_at,
    finished_at: row.finished_at,
    worker_id: row.worker_id,
    last_heartbeat_at: row.last_heartbeat_at,
    transport: decodeJsonNullable<TransportCorrelation>(row.transport_json),
  }
}

const currentWorkerStates = [
  'starting',
  'running',
  'stale',
  'cancellation-requested',
] as const

function fromWorkerRow(
  row: Selectable<AutobotSchema['workers']>,
  transport: TransportCorrelation | null
): WorkerSummary {
  return {
    worker_id: row.worker_id,
    issue_id: row.issue_id,
    run_id: row.run_id,
    flowcraft_execution_id: row.flowcraft_execution_id,
    workflow_node_id: row.workflow_node_id,
    phase: row.phase,
    state: row.state as WorkerSummary['state'],
    pid: row.pid,
    child_pid: row.child_pid,
    process_group_id: row.process_group_id,
    command: row.command,
    args: decodeJsonArray<string>(row.args_json),
    started_at: row.started_at,
    last_heartbeat_at: row.last_heartbeat_at,
    deadline_at: row.deadline_at,
    stdout_log_path: row.stdout_log_path,
    stderr_log_path: row.stderr_log_path,
    result: decodeJsonNullable<Record<string, unknown>>(row.result_json),
    result_artifact_path: row.result_artifact_path,
    exit_code: row.exit_code,
    signal: row.signal,
    finished_at: row.finished_at,
    transport,
  }
}

async function resolveWorkerTransport(
  db: Db,
  runId: string | null
): Promise<TransportCorrelation | null> {
  if (runId === null) {
    return null
  }

  const row = await db
    .selectFrom('runs')
    .select(['transport_json'])
    .where('run_id', '=', runId)
    .executeTakeFirst()

  return row === undefined
    ? null
    : decodeJsonNullable<TransportCorrelation>(row.transport_json)
}

function fromArtifactRow(
  row: Selectable<AutobotSchema['artifacts']>
): ArtifactRef & {
  artifact_id: number
  issue_id: string
  run_id: string | null
  attempt: number
  path: string
  description: string | null
  content_hash: string | null
  supersedes_artifact_id: number | null
  inherited_from_artifact_id: number | null
  created_at: string
} {
  return {
    artifact_id: row.artifact_id,
    issue_id: row.issue_id,
    run_id: row.run_id,
    attempt: row.attempt,
    kind: row.kind as ArtifactRef['kind'],
    path: row.path,
    description: row.description,
    content_hash: row.content_hash,
    supersedes_artifact_id: row.supersedes_artifact_id,
    inherited_from_artifact_id: row.inherited_from_artifact_id,
    created_at: row.created_at,
  }
}

function fromEventRow(
  row: Selectable<AutobotSchema['domain_events']>
): DomainEvent {
  return {
    event_id: row.event_id,
    issue_id: row.issue_id,
    run_id: row.run_id,
    type: row.type,
    state: row.state as DomainEvent['state'],
    message: row.message,
    severity: row.severity as DomainEvent['severity'],
    occurred_at: row.occurred_at,
    actor: row.actor,
    transport: decodeJsonNullable<TransportCorrelation>(row.transport_json),
    data: decodeJsonNullable<Record<string, unknown>>(row.data_json) ?? {},
  }
}

function toLinear(
  row: Selectable<AutobotSchema['items']>
): LinearIssueRef | null {
  if (row.title === null || row.url === null) {
    return null
  }

  return {
    issue_id: row.issue_id,
    title: row.title,
    url: row.url,
    state_name: row.state_name,
    state_type: row.state_type,
    project: row.project,
    labels: decodeJsonArray<string>(row.labels_json),
    assignee: row.assignee,
  }
}

function listQuery(db: Db, input?: ItemStateFilter) {
  let query = db.selectFrom('items').selectAll().orderBy('updated_at', 'desc')
  if (input?.include_terminal !== true) {
    query = query.where('state', 'in', [
      'queued',
      'claimed',
      'preparing',
      'planning',
      'developing',
      'testing',
      'reviewing',
      'reconciling',
      'awaiting',
      'failed',
    ])
  }

  return query
}

export function createItemProjections(db: Db): ItemProjections {
  return {
    listItems(input) {
      return Future((reject, resolve) => {
        void listQuery(db, input)
          .execute()
          .then(rows => resolve(rows.map(fromItemRow)), reject)
        return () => undefined
      })
    },
    getNextRunnableItem() {
      return Future((reject, resolve) => {
        void listQuery(db)
          .limit(1)
          .executeTakeFirst()
          .then(
            row => resolve(row === undefined ? null : fromItemRow(row)),
            reject
          )

        return () => undefined
      })
    },
    getItemDetail(issueId, options) {
      return Future((reject, resolve) => {
        void (async () => {
          const row = await db
            .selectFrom('items')
            .selectAll()
            .where('issue_id', '=', issueId)
            .executeTakeFirst()

          if (row === undefined) {
            resolve(null)
            return
          }

          const [currentRun, events, artifacts] = await Promise.all([
            db
              .selectFrom('runs')
              .selectAll()
              .where('issue_id', '=', issueId)
              .orderBy('attempt', 'desc')
              .orderBy('started_at', 'desc')
              .executeTakeFirst(),
            db
              .selectFrom('domain_events')
              .selectAll()
              .where('issue_id', '=', issueId)
              .orderBy('occurred_at', 'desc')
              .orderBy('event_id', 'desc')
              .limit(Math.max(0, Math.min(options?.eventLimit ?? 50, 500)))
              .execute(),
            db
              .selectFrom('artifacts')
              .selectAll()
              .where('issue_id', '=', issueId)
              .orderBy('created_at', 'asc')
              .execute(),
          ])

          const currentWorker = await resolveCurrentWorker(
            db,
            issueId,
            currentRun ?? null
          )

          resolve({
            ...fromItemRow(row),
            linear: toLinear(row),
            current_run:
              currentRun === undefined ? null : fromRunRow(currentRun),
            current_worker: currentWorker,
            cancellation_requested: row.cancellation_requested === 1,
            cancellation_requested_at: row.cancellation_requested_at,
            recovery_commands: decodeJsonArray<string>(
              row.recovery_commands_json
            ),
            artifacts: artifacts.map(fromArtifactRow),
            events: events.reverse().map(fromEventRow),
          })
        })().catch(reject)

        return () => undefined
      })
    },
  }
}

async function resolveCurrentWorker(
  db: Db,
  issueId: string,
  currentRun: Selectable<AutobotSchema['runs']> | null
): Promise<WorkerSummary | null> {
  const currentWorkerQuery = db
    .selectFrom('workers')
    .selectAll()
    .where('state', 'in', currentWorkerStates)
    .orderBy('started_at', 'desc')

  const currentWorkerLookups: Array<
    () => Promise<Selectable<AutobotSchema['workers']> | undefined>
  > = []

  if (currentRun?.worker_id != null) {
    currentWorkerLookups.push(() =>
      currentWorkerQuery
        .where('worker_id', '=', currentRun.worker_id)
        .executeTakeFirst()
    )
  }

  if (currentRun?.flowcraft_execution_id != null) {
    currentWorkerLookups.push(() =>
      currentWorkerQuery
        .where('flowcraft_execution_id', '=', currentRun.flowcraft_execution_id)
        .executeTakeFirst()
    )
  }

  if (currentRun !== null) {
    currentWorkerLookups.push(() =>
      currentWorkerQuery
        .where('run_id', '=', currentRun.run_id)
        .executeTakeFirst()
    )
  }

  currentWorkerLookups.push(() =>
    currentWorkerQuery.where('issue_id', '=', issueId).executeTakeFirst()
  )

  for (const lookup of currentWorkerLookups) {
    const row = await lookup()
    if (row !== undefined) {
      return fromWorkerRow(row, await resolveWorkerTransport(db, row.run_id))
    }
  }

  return null
}

export function listItems(db: Db, input?: ItemStateFilter) {
  return createItemProjections(db).listItems(input)
}

export function getNextRunnableItem(db: Db) {
  return createItemProjections(db).getNextRunnableItem()
}

export function getItemDetail(
  db: Db,
  issueId: string,
  options?: ItemDetailOptions
) {
  return createItemProjections(db).getItemDetail(issueId, options)
}
