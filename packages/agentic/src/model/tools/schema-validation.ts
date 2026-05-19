import { createError } from "./common";
import type { ToolDefinition } from "../../types";

type SchemaNode = {
  type?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  enum?: Array<string | number | boolean>;
  default?: unknown;
  description?: string;
};

type ValidationFailure = {
  path: string;
  error: string;
  reason: string;
  allowedValues?: string[];
  received: string;
};

const RECOVERY_HINTS: Record<string, string> = {
  "getDOMDiff:args.nodeId":
    "Call getDOMState() to get a DOM snapshot and a valid nodeId",
  "getElementDetails:args.nodeId":
    "Call getDOMState() to get a DOM snapshot and a valid nodeId",
  "getElementDetails:args.timestampMs":
    "Call getRecordingDuration() to get the valid recording range first",
  "getEventsAroundTime:args.timestampMs":
    "Call getRecordingDuration() to get the valid recording range first",
  "captureScreenshot:args.timestampMs":
    "Call getRecordingDuration() to get the valid recording range first",
};

const SAFE_UNKNOWN_KEYS = new Set(["_meta", "requestId"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "a non-finite number";
  if (typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (isPlainObject(value)) return "object";
  return typeof value;
}

function formatPath(base: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`;
}

function isSafeUnknownKey(key: string): boolean {
  return SAFE_UNKNOWN_KEYS.has(key);
}

function formatEnumValues(values: Array<string | number | boolean>): string {
  const formatted = values.map((value) => JSON.stringify(value));
  if (formatted.length === 0) return "no allowed values";
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return `${formatted[0]} or ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, or ${
    formatted[formatted.length - 1]
  }`;
}

function examplePrimitiveValue(
  schema: SchemaNode,
  key?: string,
): string | number | boolean {
  if (schema.enum?.length) return schema.enum[0]!;

  const hint = key?.toLowerCase() ?? "";
  if (schema.type === "boolean") return false;
  if (schema.type === "number") {
    if (hint.includes("timestamp") || hint.endsWith("ms")) return 0;
    return 1;
  }

  if (hint.includes("detail")) return "summary";
  if (hint.includes("stage")) return "orient";
  if (hint.includes("prompt")) return "Choose a path";
  if (hint.includes("query")) return "TypeError";
  if (hint.includes("method")) return "GET";
  if (hint.includes("id")) return hint.includes("node") ? "node-123" : "id-123";
  if (hint.includes("timestamp")) return 0;

  return "example";
}

function buildExampleValue(schema: SchemaNode, key?: string): unknown {
  if (schema.default !== undefined) return schema.default;

  const type = schema.type ?? (schema.properties ? "object" : undefined);

  if (type === "object") {
    const result: Record<string, unknown> = {};
    const required = schema.required ?? Object.keys(schema.properties ?? {});
    for (const prop of required) {
      const childSchema = schema.properties?.[prop];
      if (!childSchema) continue;
      result[prop] = buildExampleValue(childSchema, prop);
    }
    return result;
  }

  if (type === "array") {
    if (!schema.items) return [];
    return [buildExampleValue(schema.items, key)];
  }

  return examplePrimitiveValue(schema, key);
}

function validateSchemaNode(
  schema: SchemaNode,
  value: unknown,
  path: string,
): ValidationFailure | null {
  const type = schema.type ?? (schema.properties ? "object" : undefined);

  if (type === "object") {
    if (!isPlainObject(value)) {
      return {
        path,
        error: `${path} must be an object`,
        reason: `Received ${describeValue(value)} instead of an object`,
        received: describeValue(value),
      };
    }

    const required = schema.required ?? [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return {
          path: formatPath(path, key),
          error: `${formatPath(path, key)} is required`,
          reason: `The schema marks ${formatPath(path, key)} as required`,
          received: "missing",
        };
      }
    }

    for (const key of Object.keys(value)) {
      if (schema.properties?.[key] !== undefined) continue;
      if (isSafeUnknownKey(key)) continue;

      const unknownPath = formatPath(path, key);
      return {
        path: unknownPath,
        error: `${unknownPath} is not a supported argument`,
        reason: `Unknown argument ${unknownPath}; only declared parameters and safe metadata keys like _meta or requestId are allowed`,
        received: describeValue(value[key]),
      };
    }

    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const childFailure = validateSchemaNode(
        childSchema,
        value[key],
        formatPath(path, key),
      );
      if (childFailure) return childFailure;
    }

    return null;
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      return {
        path,
        error: `${path} must be an array`,
        reason: `Received ${describeValue(value)} instead of an array`,
        received: describeValue(value),
      };
    }

    if (!schema.items) return null;

    for (let index = 0; index < value.length; index += 1) {
      const childFailure = validateSchemaNode(
        schema.items,
        value[index],
        `${path}[${index}]`,
      );
      if (childFailure) return childFailure;
    }

    return null;
  }

  if (type === "string" && typeof value !== "string") {
    return {
      path,
      error: `${path} must be a string`,
      reason: `Received ${describeValue(value)} instead of a string`,
      received: describeValue(value),
    };
  }

  if (type === "number" && typeof value !== "number") {
    return {
      path,
      error: `${path} must be a number`,
      reason: `Received ${describeValue(value)} instead of a number`,
      received: describeValue(value),
    };
  }

  if (type === "boolean" && typeof value !== "boolean") {
    return {
      path,
      error: `${path} must be a boolean`,
      reason: `Received ${describeValue(value)} instead of a boolean`,
      received: describeValue(value),
    };
  }

  if (schema.enum && !schema.enum.includes(value as never)) {
    return {
      path,
      error: `${path} must be one of ${formatEnumValues(schema.enum)}`,
      reason: `Received ${describeValue(value)} instead of ${formatEnumValues(
        schema.enum,
      )}`,
      allowedValues: schema.enum.map((item) => JSON.stringify(item)),
      received: describeValue(value),
    };
  }

  return null;
}

function buildRecoverySuggestion(
  toolName: string,
  failure: ValidationFailure,
  exampleArgs: Record<string, unknown>,
): string {
  const hint = RECOVERY_HINTS[`${toolName}:${failure.path}`];
  const exampleCall = `${toolName}(${JSON.stringify(exampleArgs)})`;

  if (hint) {
    return `${hint}. Retry ${exampleCall}`;
  }

  return `Retry ${exampleCall}`;
}

export function validateToolArgs(
  toolName: string,
  definition: ToolDefinition | undefined,
  args: Record<string, unknown>,
): ReturnType<typeof createError> | null {
  const parameters = definition?.function.parameters as SchemaNode | undefined;
  if (!parameters) return null;

  const failure = validateSchemaNode(parameters, args, "args");
  if (!failure) return null;

  return createError(
    `Invalid tool arguments for ${toolName}: ${failure.error}`,
    `Schema validation failed for ${failure.path}; received ${failure.received}`,
    buildRecoverySuggestion(
      toolName,
      failure,
      buildExampleValue(parameters) as Record<string, unknown>,
    ),
  );
}

export function buildToolCallExamples(
  definitions: Array<ToolDefinition>,
  limit = 5,
): string {
  return definitions
    .slice(0, limit)
    .map((definition) => {
      const exampleArgs = buildExampleValue(
        definition.function.parameters as SchemaNode,
      ) as Record<string, unknown>;
      return `${definition.function.name}(${JSON.stringify(exampleArgs)})`;
    })
    .join("; ");
}
