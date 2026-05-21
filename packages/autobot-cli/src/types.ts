import type {
  ArtifactRef,
  ConfigEntry,
  DomainEvent,
  EngineStatus,
  ItemDetail,
  ItemState,
  ItemSummary,
  ErrorPayload,
  RepoRef,
  RunSummary,
  WorkerSummary,
  Warning,
} from "@repro/autobot-core";
import type {
  FlowcraftExecutionRecord,
  FlowcraftEventRecord,
} from "@repro/autobot-store";
import type {
  FlowcraftValidationResult,
  FlowcraftWorkflowId,
  FlowcraftWorkflowSummary,
} from "@repro/autobot-flowcraft";

export interface AutobotGlobalOptions {
  json: boolean;
  repo: string | null;
  state_dir: string | null;
  profile: string | null;
  quiet: boolean;
  verbose: boolean;
  color: boolean;
  dry_run: boolean;
  force: boolean;
  project: string[];
  labels: string[];
  priority: string | null;
  limit: number | null;
}

export interface AutobotInvocation {
  command_path: string[];
  command: string;
  args: string[];
  options: AutobotGlobalOptions;
}

export interface AutobotProgramOptions {
  onInvocation?: (invocation: AutobotInvocation) => void;
}

export interface EngineTickSkip {
  issue_id: string;
  reason: string;
  details: Record<string, unknown> | null;
}

export interface EngineTickReport {
  dry_run: boolean;
  tick_at: string;
  reconciled_issue_ids: string[];
  discovered_issue_ids: string[];
  queued_issue_ids: string[];
  selected_issue_ids: string[];
  started_issue_ids: string[];
  skipped: EngineTickSkip[];
}

export interface EngineStatusData {
  supervisor: EngineStatus;
  counts: Record<ItemState, number>;
  active_workers: WorkerSummary[];
  events?: readonly DomainEvent[];
  items: ItemSummary[];
  config: ConfigEntry[];
  tick?: EngineTickReport;
  action?: "start" | "stop";
  message?: string;
}

export type AutobotCommandResult =
  | {
      kind: "queue-list";
      command: string;
      repo: RepoRef;
      data: {
        items: ItemSummary[];
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "queue-status";
      command: string;
      repo: RepoRef;
      data: EngineStatusData;
      warnings?: readonly Warning[];
    }
  | {
      kind: "supervisor-status";
      command: string;
      repo: RepoRef;
      data: EngineStatusData;
      warnings?: readonly Warning[];
    }
  | {
      kind: "supervisor-logs";
      command: string;
      repo: RepoRef;
      data: EngineStatusData;
      warnings?: readonly Warning[];
    }
  | {
      kind: "queue-mutation";
      command: string;
      repo: RepoRef;
      data: {
        action: "add" | "remove";
        changed: boolean;
        dry_run: boolean;
        item: ItemSummary;
        events: DomainEvent[];
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "item-detail";
      command: string;
      repo: RepoRef;
      data: ItemDetail;
      warnings?: readonly Warning[];
    }
  | {
      kind: "config-list";
      command: string;
      repo: RepoRef;
      data: {
        config: ConfigEntry[];
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "config-value";
      command: string;
      repo: RepoRef;
      data: {
        config: ConfigEntry;
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "config-mutation";
      command: string;
      repo: RepoRef;
      data: {
        action: "set" | "unset";
        changed: boolean;
        dry_run: boolean;
        previous: ConfigEntry;
        next: ConfigEntry;
        events: DomainEvent[];
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "discover";
      command: string;
      repo: RepoRef;
      data: DiscoverData;
      warnings?: readonly Warning[];
    }
  | {
      kind: "workflow-list";
      command: string;
      repo: RepoRef;
      data: {
        workflows: FlowcraftWorkflowSummary[];
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "workflow-validation";
      command: string;
      repo: RepoRef;
      data: {
        validations: FlowcraftValidationResult[];
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "workflow-diagram";
      command: string;
      repo: RepoRef;
      data: {
        workflow_id: FlowcraftWorkflowId;
        diagram: string;
      };
      warnings?: readonly Warning[];
    }
  | {
      kind: "flowcraft-inspect";
      command: string;
      repo: RepoRef;
      data: {
        lookup: {
          kind: "run" | "flowcraft-execution";
          identifier: string;
          issue_id: string | null;
          run: RunSummary | null;
          worker: WorkerSummary | null;
          execution: FlowcraftExecutionRecord | null;
          artifacts: ArtifactRef[];
          domain_events: DomainEvent[];
          flowcraft_events: FlowcraftEventRecord[];
        };
      };
      warnings?: readonly Warning[];
    };

export interface DiscoverCandidate {
  issue_id: string;
  title: string | null;
  url: string | null;
  project: string | null;
  labels: string[];
  priority: number | null;
  priority_label: string | null;
  status_name: string | null;
  state_type: string | null;
  assignee: string | null;
}

export interface DiscoverExclusion {
  issue_id: string;
  reason: string;
  details: Record<string, unknown> | null;
}

export interface DiscoverData {
  projects: string[];
  query: string | null;
  filters: {
    labels: string[];
    priority: string | null;
    limit: number;
    scan_limit: number;
  };
  scanned: number;
  candidates: DiscoverCandidate[];
  issue_ids: string[];
  exclusions: DiscoverExclusion[];
  quiet: boolean;
}

export interface AutobotErrorEnvelopeInput {
  command: string;
  repo?: RepoRef;
  error: ErrorPayload;
  warnings?: readonly Warning[];
}

export interface AutobotSuccessEnvelopeInput<TData> {
  command: string;
  repo: RepoRef;
  data: TData;
  warnings?: readonly Warning[];
}
