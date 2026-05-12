import type {
  EffectRequest,
  ProcessQueueResult,
  QueuePayload,
  QueueSummary,
  TaskInput,
  TransitionDecision,
} from "@repro/autobot-engine";

export type {
  EffectRequest,
  ProcessQueueResult,
  QueuePayload,
  QueueSummary,
  TaskInput,
  TransitionDecision,
};

export interface AutobotConfigValues {
  "engine.auto-discover": "on" | "off";
  "engine.queue-depth": number;
  "engine.max-concurrency": number;
  "engine.tick-frequency": number;
}

export interface AutobotConfigItem {
  key: keyof AutobotConfigValues;
  value: AutobotConfigValues[keyof AutobotConfigValues];
  source: "default" | "repo";
  description: string;
}

export interface AutobotConfigResult<T> {
  schema_version: number;
  config_path: string;
  value?: T;
  values?: AutobotConfigValues;
  items?: AutobotConfigItem[];
  key?: string;
  source?: "default" | "repo";
}

export interface AutobotPublicItem {
  issue_identifier: string;
  issue_title?: string;
  issue_priority?: string;
  issue_assignee?: string;
  issue_labels?: string[];
  state: string;
  workspace_path: string;
  queued_by: string;
  updated_at: string;
  attempt_count: number;
  last_observed_issue_state_name: string;
  last_observed_issue_state_type: string;
  conditions: Array<{ kind: string; value: string }>;
  reason?: string;
}

export interface AutobotPublicStatus {
  schema_version: number;
  config: Record<string, unknown>;
  items: AutobotPublicItem[];
  summary: {
    total: number;
    queued: number;
    running: number;
    needs_attention: number;
    released: number;
    removed: number;
  };
  generated_at: string;
}

export interface AutobotIssueStatus {
  schema_version: number;
  generated_at: string;
  issue: AutobotPublicItem | null;
  history: string[];
  logs: string[];
}

export type AutobotPublicQueueSummary = Omit<
  QueueSummary,
  "selected_issue_identifier" | "selected_state"
>;

export interface AutobotEngineStatus {
  schema_version: number;
  config: Record<string, unknown>;
  engine: {
    pid: number | null;
    running: boolean;
    mode: "foreground" | "daemon";
    active_work: AutobotPublicItem[];
    last_tick_at: string;
  };
  paths: {
    lock: string;
    pid: string;
    log: string;
    status: string;
  };
  queue: {
    items: AutobotPublicItem[];
    active_work: AutobotPublicItem[];
    summary: AutobotPublicQueueSummary;
  };
  generated_at: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}
