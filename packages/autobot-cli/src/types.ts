import type {
  ConfigEntry,
  DomainEvent,
  EngineStatus,
  ItemDetail,
  ItemState,
  ItemSummary,
  ErrorPayload,
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
  dry_run: boolean;
  force: boolean;
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
      data: {
        engine: EngineStatus;
        counts: Record<ItemState, number>;
        items: ItemSummary[];
        config: ConfigEntry[];
      };
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
    };

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
