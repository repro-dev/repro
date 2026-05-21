import type { ColumnType, Generated } from 'kysely'

export type SqliteJson = ColumnType<string, string, string>

export interface AutobotMigrationsTable {
  name: string
  applied_at: string
}

export interface ItemsTable {
  issue_id: string
  title: string | null
  url: string | null
  state: string
  attempt: number
  priority: number | null
  owner: string | null
  workspace: string | null
  branch: string | null
  queued_at: string | null
  started_at: string | null
  updated_at: string
  last_event: string | null
  last_error_json: string | null
  recovery_commands_json: string
  cancellation_requested: number
  cancellation_requested_at: string | null
  state_name: string | null
  state_type: string | null
  project: string | null
  labels_json: string
  assignee: string | null
  current_run_id: string | null
}

export interface RunsTable {
  run_id: string
  issue_id: string
  attempt: number
  state: string
  flowcraft_execution_id: string | null
  blueprint_id: string
  blueprint_version: string
  started_at: string
  finished_at: string | null
  worker_id: string | null
  last_heartbeat_at: string | null
  transport_json: string | null
}

export interface WorkersTable {
  worker_id: string
  issue_id: string | null
  run_id: string | null
  flowcraft_execution_id: string | null
  workflow_node_id: string | null
  phase: string | null
  state: string
  pid: number | null
  child_pid: number | null
  process_group_id: number | null
  command: string | null
  args_json: string
  started_at: string
  last_heartbeat_at: string | null
  deadline_at: string | null
  stdout_log_path: string | null
  stderr_log_path: string | null
  result_json: string | null
  result_artifact_path: string | null
  exit_code: number | null
  signal: string | null
  finished_at: string | null
}

export interface ConfigOverridesTable {
  key: string
  value: string
  value_type: string
  source: string
  updated_at: string
}

export interface ArtifactsTable {
  artifact_id: Generated<number>
  issue_id: string
  run_id: string | null
  attempt: number
  kind: string
  path: string
  description: string | null
  content_hash: string | null
  supersedes_artifact_id: number | null
  inherited_from_artifact_id: number | null
  created_at: string
}

export interface DomainEventsTable {
  event_id: string
  issue_id: string | null
  run_id: string | null
  type: string
  state: string | null
  message: string
  severity: string
  occurred_at: string
  actor: string
  transport_json: string | null
  data_json: string
}

export interface FlowcraftExecutionsTable {
  execution_id: string
  issue_id: string
  run_id: string | null
  state: string
  started_at: string
  finished_at: string | null
  metadata_json: string
}

export interface FlowcraftEventsTable {
  flowcraft_event_id: string
  execution_id: string
  node_id: string
  type: string
  occurred_at: string
  data_json: string
}

export interface AutobotSchema {
  autobot_migrations: AutobotMigrationsTable
  items: ItemsTable
  runs: RunsTable
  workers: WorkersTable
  config_overrides: ConfigOverridesTable
  artifacts: ArtifactsTable
  domain_events: DomainEventsTable
  flowcraft_executions: FlowcraftExecutionsTable
  flowcraft_events: FlowcraftEventsTable
}
