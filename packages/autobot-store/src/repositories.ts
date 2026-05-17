import type {
  ArtifactRef,
  ConfigSource,
  ConfigValue,
  DomainEvent,
  ErrorSummary,
  ItemDetail,
  ItemState,
  ItemSummary,
  RepoRef,
  RunSummary,
  TransportCorrelation,
  WorkerSummary,
} from '@repro/autobot-core'
import { Future, fork, type FutureInstance } from 'fluture'
import type { Kysely, Selectable } from 'kysely'

import { decodeJsonNullable, encodeJson, encodeJsonArray } from './json'
import {
  createItemProjections,
  type ItemProjections,
  type ItemStateFilter,
} from './projections'
import type { AutobotSchema } from './schema'

type Db = Kysely<AutobotSchema>

interface CreateAutobotRepositoriesOptions {
  destroyOnClose?: boolean
}

export interface ItemRecord {
  issue_id: string
  title: string | null
  url: string | null
  state: ItemState
  attempt: number
  priority: number | null
  owner: string | null
  workspace: string | null
  branch: string | null
  queued_at: string | null
  started_at: string | null
  updated_at: string
  last_event: string | null
  last_error: ErrorSummary | null
  recovery_commands: string[]
  cancellation_requested: boolean
  cancellation_requested_at: string | null
  state_name: string | null
  state_type: string | null
  project: string | null
  labels: string[]
  assignee: string | null
  current_run_id: string | null
}

export interface RunRecord {
  run_id: string
  issue_id: string
  attempt: number
  state: ItemState
  flowcraft_execution_id: string | null
  blueprint_id: string
  blueprint_version: string
  started_at: string
  finished_at: string | null
  worker_id: string | null
  last_heartbeat_at: string | null
  transport: TransportCorrelation | null
}

export interface WorkerRecord {
  worker_id: string
  issue_id: string | null
  run_id: string | null
  state: WorkerSummary['state']
  pid: number | null
  started_at: string
  last_heartbeat_at: string | null
}

export interface ConfigOverrideRecord {
  key: string
  value: ConfigValue
  value_type: 'boolean' | 'integer' | 'string'
  source: ConfigSource
  updated_at: string
}

export interface ArtifactRecord {
  artifact_id: number
  issue_id: string
  run_id: string | null
  attempt: number
  kind: ArtifactRef['kind']
  path: string
  description: string | null
  content_hash: string | null
  supersedes_artifact_id: number | null
  inherited_from_artifact_id: number | null
  created_at: string
}

export interface DomainEventRecord extends DomainEvent {}

export interface FlowcraftExecutionRecord {
  execution_id: string
  issue_id: string
  run_id: string | null
  state: string
  started_at: string
  finished_at: string | null
  metadata: Record<string, unknown>
}

export interface FlowcraftEventRecord {
  flowcraft_event_id: string
  execution_id: string
  node_id: string
  type: string
  occurred_at: string
  data: Record<string, unknown>
}

export interface ItemRepository {
  upsert(input: ItemRecord): FutureInstance<unknown, ItemSummary>
  get(issueId: string): FutureInstance<unknown, ItemSummary | null>
}

export interface RunRepository {
  upsert(input: RunRecord): FutureInstance<unknown, RunSummary>
  get(runId: string): FutureInstance<unknown, RunSummary | null>
  getCurrent(issueId: string): FutureInstance<unknown, RunSummary | null>
}

export interface WorkerRepository {
  upsert(input: WorkerRecord): FutureInstance<unknown, WorkerSummary>
  list(): FutureInstance<unknown, WorkerSummary[]>
}

export interface ConfigRepository {
  setOverride(input: {
    key: string
    value: ConfigValue
    value_type: ConfigOverrideRecord['value_type']
    source: ConfigSource
    updated_at: string
  }): FutureInstance<unknown, ConfigOverrideRecord>
  getOverride(key: string): FutureInstance<unknown, ConfigOverrideRecord | null>
  listOverrides(): FutureInstance<unknown, ConfigOverrideRecord[]>
  deleteOverride(key: string): FutureInstance<unknown, void>
}

export interface ArtifactRepository {
  record(
    input: Omit<ArtifactRecord, 'artifact_id'>
  ): FutureInstance<unknown, ArtifactRecord>
  list(issueId: string): FutureInstance<unknown, ArtifactRecord[]>
}

export interface DomainEventRepository {
  append(input: DomainEventRecord): FutureInstance<unknown, DomainEventRecord>
  list(
    issueId?: string,
    options?: DomainEventListOptions
  ): FutureInstance<unknown, DomainEventRecord[]>
}

export interface FlowcraftHistoryRepository {
  recordExecution(
    input: FlowcraftExecutionRecord
  ): FutureInstance<unknown, FlowcraftExecutionRecord>
  getExecution(
    executionId: string
  ): FutureInstance<unknown, FlowcraftExecutionRecord | null>
  listExecutions(
    issueId: string
  ): FutureInstance<unknown, FlowcraftExecutionRecord[]>
  recordEvent(
    input: FlowcraftEventRecord
  ): FutureInstance<unknown, FlowcraftEventRecord>
  listEvents(
    executionId: string
  ): FutureInstance<unknown, FlowcraftEventRecord[]>
}

export interface StoreProjectionRepository extends ItemProjections {
  listItems(input?: ItemStateFilter): FutureInstance<unknown, ItemSummary[]>
  getItemDetail(issueId: string): FutureInstance<unknown, ItemDetail | null>
}

export interface DomainEventListOptions {
  limit?: number
  runId?: string
  typePrefix?: string
  order?: 'asc' | 'desc'
  beforeOccurredAt?: string
  beforeEventId?: string
  afterOccurredAt?: string
  afterEventId?: string
}

export interface AutobotStore {
  repo: RepoRef
  close(): FutureInstance<unknown, void>
  transaction<T>(
    handler: (store: AutobotStore) => FutureInstance<unknown, T>
  ): FutureInstance<unknown, T>
  items: ItemRepository
  runs: RunRepository
  workers: WorkerRepository
  config: ConfigRepository
  artifacts: ArtifactRepository
  events: DomainEventRepository
  flowcraft: FlowcraftHistoryRepository
  projections: StoreProjectionRepository
}

function futureAsync<T>(thunk: () => Promise<T>): FutureInstance<unknown, T> {
  return Future((reject, resolve) => {
    let cancelled = false

    void thunk().then(
      value => {
        if (!cancelled) {
          resolve(value)
        }
      },
      error => {
        if (!cancelled) {
          reject(error)
        }
      }
    )

    return () => {
      cancelled = true
    }
  })
}

function fromItemRow(row: Selectable<AutobotSchema['items']>): ItemSummary {
  return {
    issue_id: row.issue_id,
    title: row.title,
    url: row.url,
    state: row.state as ItemState,
    attempt: row.attempt,
    priority: row.priority,
    owner: row.owner,
    workspace: row.workspace,
    branch: row.branch,
    queued_at: row.queued_at,
    started_at: row.started_at,
    updated_at: row.updated_at,
    last_event: row.last_event,
    last_error: decodeJsonNullable<ErrorSummary>(row.last_error_json),
  }
}

function fromRunRow(row: Selectable<AutobotSchema['runs']>): RunSummary {
  return {
    run_id: row.run_id,
    issue_id: row.issue_id,
    attempt: row.attempt,
    state: row.state as ItemState,
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

function fromWorkerRow(
  row: Selectable<AutobotSchema['workers']>,
  transport: TransportCorrelation | null
): WorkerSummary {
  return {
    worker_id: row.worker_id,
    issue_id: row.issue_id,
    run_id: row.run_id,
    state: row.state as WorkerSummary['state'],
    pid: row.pid,
    started_at: row.started_at,
    last_heartbeat_at: row.last_heartbeat_at,
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
): ArtifactRecord {
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
): DomainEventRecord {
  return {
    event_id: row.event_id,
    issue_id: row.issue_id,
    run_id: row.run_id,
    type: row.type,
    state: row.state as ItemState | null,
    message: row.message,
    severity: row.severity as DomainEvent['severity'],
    occurred_at: row.occurred_at,
    actor: row.actor,
    transport: decodeJsonNullable<TransportCorrelation>(row.transport_json),
    data: decodeJsonNullable<Record<string, unknown>>(row.data_json) ?? {},
  }
}

function fromFlowcraftExecutionRow(
  row: Selectable<AutobotSchema['flowcraft_executions']>
): FlowcraftExecutionRecord {
  return {
    execution_id: row.execution_id,
    issue_id: row.issue_id,
    run_id: row.run_id,
    state: row.state,
    started_at: row.started_at,
    finished_at: row.finished_at,
    metadata:
      decodeJsonNullable<Record<string, unknown>>(row.metadata_json) ?? {},
  }
}

function fromFlowcraftEventRow(
  row: Selectable<AutobotSchema['flowcraft_events']>
): FlowcraftEventRecord {
  return {
    flowcraft_event_id: row.flowcraft_event_id,
    execution_id: row.execution_id,
    node_id: row.node_id,
    type: row.type,
    occurred_at: row.occurred_at,
    data: decodeJsonNullable<Record<string, unknown>>(row.data_json) ?? {},
  }
}

function toConfigRecord(
  row: Selectable<AutobotSchema['config_overrides']>
): ConfigOverrideRecord {
  const parsed = decodeJsonNullable<ConfigValue>(row.value)
  return {
    key: row.key,
    value: parsed ?? row.value,
    value_type: row.value_type as ConfigOverrideRecord['value_type'],
    source: row.source as ConfigSource,
    updated_at: row.updated_at,
  }
}

export function createAutobotRepositories(
  db: Db,
  repo: RepoRef,
  options: CreateAutobotRepositoriesOptions = {}
): AutobotStore {
  const destroyOnClose = options.destroyOnClose !== false
  const projections = createItemProjections(db)

  const items: ItemRepository = {
    upsert(input) {
      return futureAsync(async () => {
        await db
          .insertInto('items')
          .values({
            issue_id: input.issue_id,
            title: input.title,
            url: input.url,
            state: input.state,
            attempt: input.attempt,
            priority: input.priority,
            owner: input.owner,
            workspace: input.workspace,
            branch: input.branch,
            queued_at: input.queued_at,
            started_at: input.started_at,
            updated_at: input.updated_at,
            last_event: input.last_event,
            last_error_json:
              input.last_error === null ? null : encodeJson(input.last_error),
            recovery_commands_json: encodeJsonArray(input.recovery_commands),
            cancellation_requested: input.cancellation_requested ? 1 : 0,
            cancellation_requested_at: input.cancellation_requested_at,
            state_name: input.state_name,
            state_type: input.state_type,
            project: input.project,
            labels_json: encodeJsonArray(input.labels),
            assignee: input.assignee,
            current_run_id: input.current_run_id,
          })
          .onConflict(conflict =>
            conflict.column('issue_id').doUpdateSet({
              title: input.title,
              url: input.url,
              state: input.state,
              attempt: input.attempt,
              priority: input.priority,
              owner: input.owner,
              workspace: input.workspace,
              branch: input.branch,
              queued_at: input.queued_at,
              started_at: input.started_at,
              updated_at: input.updated_at,
              last_event: input.last_event,
              last_error_json:
                input.last_error === null ? null : encodeJson(input.last_error),
              recovery_commands_json: encodeJsonArray(input.recovery_commands),
              cancellation_requested: input.cancellation_requested ? 1 : 0,
              cancellation_requested_at: input.cancellation_requested_at,
              state_name: input.state_name,
              state_type: input.state_type,
              project: input.project,
              labels_json: encodeJsonArray(input.labels),
              assignee: input.assignee,
              current_run_id: input.current_run_id,
            })
          )
          .execute()

        const row = await db
          .selectFrom('items')
          .selectAll()
          .where('issue_id', '=', input.issue_id)
          .executeTakeFirstOrThrow()
        return fromItemRow(row)
      })
    },
    get(issueId) {
      return futureAsync(async () => {
        const row = await db
          .selectFrom('items')
          .selectAll()
          .where('issue_id', '=', issueId)
          .executeTakeFirst()
        return row === undefined ? null : fromItemRow(row)
      })
    },
  }

  const runs: RunRepository = {
    upsert(input) {
      return futureAsync(async () => {
        await db
          .insertInto('runs')
          .values({
            run_id: input.run_id,
            issue_id: input.issue_id,
            attempt: input.attempt,
            state: input.state,
            flowcraft_execution_id: input.flowcraft_execution_id,
            blueprint_id: input.blueprint_id,
            blueprint_version: input.blueprint_version,
            started_at: input.started_at,
            finished_at: input.finished_at,
            worker_id: input.worker_id,
            last_heartbeat_at: input.last_heartbeat_at,
            transport_json:
              input.transport === null ? null : encodeJson(input.transport),
          })
          .onConflict(conflict =>
            conflict.column('run_id').doUpdateSet({
              issue_id: input.issue_id,
              attempt: input.attempt,
              state: input.state,
              flowcraft_execution_id: input.flowcraft_execution_id,
              blueprint_id: input.blueprint_id,
              blueprint_version: input.blueprint_version,
              started_at: input.started_at,
              finished_at: input.finished_at,
              worker_id: input.worker_id,
              last_heartbeat_at: input.last_heartbeat_at,
              transport_json:
                input.transport === null ? null : encodeJson(input.transport),
            })
          )
          .execute()

        const row = await db
          .selectFrom('runs')
          .selectAll()
          .where('run_id', '=', input.run_id)
          .executeTakeFirstOrThrow()
        return fromRunRow(row)
      })
    },
    get(runId) {
      return futureAsync(async () => {
        const row = await db
          .selectFrom('runs')
          .selectAll()
          .where('run_id', '=', runId)
          .executeTakeFirst()
        return row === undefined ? null : fromRunRow(row)
      })
    },
    getCurrent(issueId) {
      return futureAsync(async () => {
        const row = await db
          .selectFrom('runs')
          .selectAll()
          .where('issue_id', '=', issueId)
          .orderBy('attempt', 'desc')
          .orderBy('started_at', 'desc')
          .executeTakeFirst()
        return row === undefined ? null : fromRunRow(row)
      })
    },
  }

  const workers: WorkerRepository = {
    upsert(input) {
      return futureAsync(async () => {
        await db
          .insertInto('workers')
          .values(input)
          .onConflict(conflict =>
            conflict.column('worker_id').doUpdateSet({
              issue_id: input.issue_id,
              run_id: input.run_id,
              state: input.state,
              pid: input.pid,
              started_at: input.started_at,
              last_heartbeat_at: input.last_heartbeat_at,
            })
          )
          .execute()

        const row = await db
          .selectFrom('workers')
          .selectAll()
          .where('worker_id', '=', input.worker_id)
          .executeTakeFirstOrThrow()
        return fromWorkerRow(row, await resolveWorkerTransport(db, row.run_id))
      })
    },
    list() {
      return futureAsync(async () => {
        const rows = await db
          .selectFrom('workers')
          .selectAll()
          .orderBy('started_at', 'desc')
          .execute()
        return Promise.all(
          rows.map(async row =>
            fromWorkerRow(row, await resolveWorkerTransport(db, row.run_id))
          )
        )
      })
    },
  }

  const config: ConfigRepository = {
    setOverride(input) {
      return futureAsync(async () => {
        await db
          .insertInto('config_overrides')
          .values({
            key: input.key,
            value: encodeJson(input.value),
            value_type: input.value_type,
            source: input.source,
            updated_at: input.updated_at,
          })
          .onConflict(conflict =>
            conflict.column('key').doUpdateSet({
              value: encodeJson(input.value),
              value_type: input.value_type,
              source: input.source,
              updated_at: input.updated_at,
            })
          )
          .execute()
        return {
          key: input.key,
          value: input.value,
          value_type: input.value_type,
          source: input.source,
          updated_at: input.updated_at,
        }
      })
    },
    getOverride(key) {
      return futureAsync(async () => {
        const row = await db
          .selectFrom('config_overrides')
          .selectAll()
          .where('key', '=', key)
          .executeTakeFirst()
        return row === undefined ? null : toConfigRecord(row)
      })
    },
    listOverrides() {
      return futureAsync(async () => {
        const rows = await db
          .selectFrom('config_overrides')
          .selectAll()
          .orderBy('key', 'asc')
          .execute()
        return rows.map(toConfigRecord)
      })
    },
    deleteOverride(key) {
      return futureAsync(async () => {
        await db.deleteFrom('config_overrides').where('key', '=', key).execute()
      })
    },
  }

  const artifacts: ArtifactRepository = {
    record(input) {
      return futureAsync(async () => {
        const row = await db
          .insertInto('artifacts')
          .values({
            issue_id: input.issue_id,
            run_id: input.run_id,
            attempt: input.attempt,
            kind: input.kind,
            path: input.path,
            description: input.description,
            content_hash: input.content_hash,
            supersedes_artifact_id: input.supersedes_artifact_id,
            inherited_from_artifact_id: input.inherited_from_artifact_id,
            created_at: input.created_at,
          })
          .returningAll()
          .executeTakeFirstOrThrow()

        return fromArtifactRow(row)
      })
    },
    list(issueId) {
      return futureAsync(async () => {
        const rows = await db
          .selectFrom('artifacts')
          .selectAll()
          .where('issue_id', '=', issueId)
          .orderBy('created_at', 'asc')
          .execute()
        return rows.map(fromArtifactRow)
      })
    },
  }

  const events: DomainEventRepository = {
    append(input) {
      return futureAsync(async () => {
        await db
          .insertInto('domain_events')
          .values({
            event_id: input.event_id,
            issue_id: input.issue_id,
            run_id: input.run_id,
            type: input.type,
            state: input.state,
            message: input.message,
            severity: input.severity,
            occurred_at: input.occurred_at,
            actor: input.actor,
            transport_json:
              input.transport === null ? null : encodeJson(input.transport),
            data_json: encodeJson(input.data),
          })
          .execute()

        const row = await db
          .selectFrom('domain_events')
          .selectAll()
          .where('event_id', '=', input.event_id)
          .executeTakeFirstOrThrow()
        return fromEventRow(row)
      })
    },
    list(issueId, options) {
      return futureAsync(async () => {
        let query = db.selectFrom('domain_events').selectAll()
        const order = options?.order ?? 'asc'
        const afterOccurredAt = options?.afterOccurredAt
        const afterEventId = options?.afterEventId
        const beforeOccurredAt = options?.beforeOccurredAt
        const beforeEventId = options?.beforeEventId
        const typePrefix = options?.typePrefix

        if (issueId !== undefined) {
          query = query.where('issue_id', '=', issueId)
        }

        if (options?.runId !== undefined) {
          query = query.where('run_id', '=', options.runId)
        }

        if (typePrefix !== undefined) {
          query = query.where('type', 'like', `${typePrefix}%`)
        }

        if (afterOccurredAt !== undefined) {
          query = query.where(builder =>
            afterEventId === undefined
              ? builder('occurred_at', '>', afterOccurredAt)
              : builder.or([
                  builder('occurred_at', '>', afterOccurredAt),
                  builder.and([
                    builder('occurred_at', '=', afterOccurredAt),
                    builder('event_id', '>', afterEventId),
                  ]),
                ])
          )
        }

        if (beforeOccurredAt !== undefined) {
          query = query.where(builder =>
            beforeEventId === undefined
              ? builder('occurred_at', '<', beforeOccurredAt)
              : builder.or([
                  builder('occurred_at', '<', beforeOccurredAt),
                  builder.and([
                    builder('occurred_at', '=', beforeOccurredAt),
                    builder('event_id', '<', beforeEventId),
                  ]),
                ])
          )
        }

        query =
          order === 'desc'
            ? query.orderBy('occurred_at', 'desc').orderBy('event_id', 'desc')
            : query.orderBy('occurred_at', 'asc').orderBy('event_id', 'asc')

        const rows = await query
          .limit(Math.max(0, Math.min(options?.limit ?? 100, 1000)))
          .execute()
        return rows.map(fromEventRow)
      })
    },
  }

  const transaction: AutobotStore['transaction'] = <T>(
    handler: (store: AutobotStore) => FutureInstance<unknown, T>
  ) =>
    Future(
      (reject: (error: unknown) => void, resolve: (value: unknown) => void) => {
        let cancelled = false

        void db
          .transaction()
          .execute(async transactionDb => {
            const transactionStore = createAutobotRepositories(
              transactionDb,
              repo,
              {
                destroyOnClose: false,
              }
            )

            return await new Promise<T>(
              (transactionResolve, transactionReject) => {
                handler(transactionStore).pipe(
                  fork(transactionReject)(transactionResolve)
                )
              }
            )
          })
          .then(
            value => {
              if (!cancelled) {
                resolve(value)
              }
            },
            error => {
              if (!cancelled) {
                reject(error)
              }
            }
          )

        return () => {
          cancelled = true
        }
      }
    ) as FutureInstance<unknown, T>

  const flowcraft: FlowcraftHistoryRepository = {
    recordExecution(input) {
      return futureAsync(async () => {
        await db
          .insertInto('flowcraft_executions')
          .values({
            execution_id: input.execution_id,
            issue_id: input.issue_id,
            run_id: input.run_id,
            state: input.state,
            started_at: input.started_at,
            finished_at: input.finished_at,
            metadata_json: encodeJson(input.metadata),
          })
          .onConflict(conflict =>
            conflict.column('execution_id').doUpdateSet({
              issue_id: input.issue_id,
              run_id: input.run_id,
              state: input.state,
              started_at: input.started_at,
              finished_at: input.finished_at,
              metadata_json: encodeJson(input.metadata),
            })
          )
          .execute()
        return input
      })
    },
    getExecution(executionId) {
      return futureAsync(async () => {
        const row = await db
          .selectFrom('flowcraft_executions')
          .selectAll()
          .where('execution_id', '=', executionId)
          .executeTakeFirst()
        return row === undefined ? null : fromFlowcraftExecutionRow(row)
      })
    },
    listExecutions(issueId) {
      return futureAsync(async () => {
        const rows = await db
          .selectFrom('flowcraft_executions')
          .selectAll()
          .where('issue_id', '=', issueId)
          .orderBy('started_at', 'asc')
          .execute()
        return rows.map(fromFlowcraftExecutionRow)
      })
    },
    recordEvent(input) {
      return futureAsync(async () => {
        await db
          .insertInto('flowcraft_events')
          .values({
            flowcraft_event_id: input.flowcraft_event_id,
            execution_id: input.execution_id,
            node_id: input.node_id,
            type: input.type,
            occurred_at: input.occurred_at,
            data_json: encodeJson(input.data),
          })
          .execute()
        return input
      })
    },
    listEvents(executionId) {
      return futureAsync(async () => {
        const rows = await db
          .selectFrom('flowcraft_events')
          .selectAll()
          .where('execution_id', '=', executionId)
          .orderBy('occurred_at', 'asc')
          .execute()
        return rows.map(fromFlowcraftEventRow)
      })
    },
  }

  return {
    repo,
    close() {
      if (!destroyOnClose) {
        return Future((_reject, resolve) => {
          resolve(undefined)
          return () => undefined
        })
      }

      return futureAsync(() => db.destroy())
    },
    transaction,
    items,
    runs,
    workers,
    config,
    artifacts,
    events,
    flowcraft,
    projections,
  }
}
