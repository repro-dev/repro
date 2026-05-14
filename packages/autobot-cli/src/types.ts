import type {
  ErrorPayload,
  IsoTimestamp,
  RepoRef,
  Warning,
} from "@repro/autobot-core";

export interface AutobotGlobalOptions {
  json: boolean;
  repo: string | null;
  state_dir: string | null;
  profile: string | null;
  quiet: boolean;
  verbose: boolean;
  color: boolean;
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

export interface AutobotCommandResult<TData = unknown> {
  command: string;
  repo: RepoRef;
  data: TData;
  human: string;
  warnings?: readonly Warning[];
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

export interface AutobotRenderedStatus {
  issue_id: string;
  title: string | null;
  url: string | null;
  state: string;
  attempt: number;
  priority: number | null;
  owner: string | null;
  workspace: string | null;
  branch: string | null;
  queued_at: IsoTimestamp | null;
  started_at: IsoTimestamp | null;
  updated_at: IsoTimestamp;
  last_event: string | null;
  last_error: {
    code: string;
    message: string;
    occurred_at: IsoTimestamp;
  } | null;
  linear: null;
  current_run: null;
  cancellation_requested: boolean;
  cancellation_requested_at: IsoTimestamp | null;
  recovery_commands: string[];
  artifacts: readonly unknown[];
  events: readonly unknown[];
}
