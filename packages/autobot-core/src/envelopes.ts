import type {
  ErrorPayload,
  JsonEnvelope,
  JsonErrorEnvelope,
  RepoRef,
  Warning,
} from "./contracts";

export function createJsonSuccessEnvelope<TData>(input: {
  command: string;
  repo: RepoRef;
  data: TData;
  warnings?: readonly Warning[];
}): JsonEnvelope<TData> {
  return {
    schema_version: 1,
    ok: true,
    command: input.command,
    repo: input.repo,
    data: input.data,
    warnings: [...(input.warnings ?? [])],
  };
}

export function createJsonErrorEnvelope(input: {
  command: string;
  error: ErrorPayload;
  repo?: RepoRef;
  warnings?: readonly Warning[];
}): JsonErrorEnvelope {
  const envelope: JsonErrorEnvelope = {
    schema_version: 1,
    ok: false,
    command: input.command,
    error: input.error,
    warnings: [...(input.warnings ?? [])],
  };

  if (input.repo !== undefined) {
    envelope.repo = input.repo;
  }

  return envelope;
}
