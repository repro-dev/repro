import type {
  ItemDetail,
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
      kind: "item-summary";
      command: string;
      repo: RepoRef;
      data: ItemSummary;
      warnings?: readonly Warning[];
    }
  | {
      kind: "item-detail";
      command: string;
      repo: RepoRef;
      data: ItemDetail;
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
