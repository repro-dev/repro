import z from 'zod'
import type { ToolDefinition } from '../../types'
import { createError } from './common'

type SchemaNode = {
  type?: string
  properties?: Record<string, SchemaNode>
  required?: string[]
  items?: SchemaNode
  enum?: Array<string | number | boolean>
  default?: unknown
  description?: string
}

type ValidationFailure = {
  path: string
  error: string
  reason: string
  allowedValues?: string[]
  received: string
}

const RECOVERY_HINTS: Record<string, string> = {
  'getDOMDiff:args.nodeId':
    'Call getDOMState() to get a DOM snapshot and a valid nodeId',
  'getElementDetails:args.nodeId':
    'Call getDOMState() to get a DOM snapshot and a valid nodeId',
  'getElementDetails:args.timestampMs':
    'Call getRecordingDuration() to get the valid recording range first',
  'getEventsAroundTime:args.timestampMs':
    'Call getRecordingDuration() to get the valid recording range first',
  'captureScreenshot:args.timestampMs':
    'Call getRecordingDuration() to get the valid recording range first',
}

const SAFE_UNKNOWN_KEYS = new Set(['_meta', 'requestId'])

const schemaCache = new WeakMap<SchemaNode, z.ZodTypeAny>()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'a non-finite number'
  if (typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (isPlainObject(value)) return 'object'
  return typeof value
}

function formatPath(base: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`
}

function formatIssuePath(path: Array<string | number>): string {
  let result = 'args'
  for (const segment of path) {
    if (typeof segment === 'number') {
      result += `[${segment}]`
    } else {
      result = formatPath(result, segment)
    }
  }
  return result
}

function isSafeUnknownKey(key: string): boolean {
  return SAFE_UNKNOWN_KEYS.has(key)
}

function formatEnumValues(values: Array<string | number | boolean>): string {
  const formatted = values.map(value => JSON.stringify(value))
  if (formatted.length === 0) return 'no allowed values'
  if (formatted.length === 1) return formatted[0]!
  if (formatted.length === 2) return `${formatted[0]} or ${formatted[1]}`
  return `${formatted.slice(0, -1).join(', ')}, or ${
    formatted[formatted.length - 1]
  }`
}

function examplePrimitiveValue(
  schema: SchemaNode,
  key?: string
): string | number | boolean {
  if (schema.enum?.length) return schema.enum[0]!

  const hint = key?.toLowerCase() ?? ''
  if (schema.type === 'boolean') return false
  if (schema.type === 'number') {
    if (hint.includes('timestamp') || hint.endsWith('ms')) return 0
    return 1
  }

  if (hint.includes('detail')) return 'summary'
  if (hint.includes('stage')) return 'orient'
  if (hint.includes('prompt')) return 'Choose a path'
  if (hint.includes('query')) return 'TypeError'
  if (hint.includes('method')) return 'GET'
  if (hint.includes('id')) return hint.includes('node') ? 'node-123' : 'id-123'
  if (hint.includes('timestamp')) return 0

  return 'example'
}

function buildExampleValue(schema: SchemaNode, key?: string): unknown {
  if (schema.default !== undefined) return schema.default

  const type = schema.type ?? (schema.properties ? 'object' : undefined)

  if (type === 'object') {
    const result: Record<string, unknown> = {}
    const required = schema.required ?? []
    for (const prop of required) {
      const childSchema = schema.properties?.[prop]
      if (!childSchema) continue
      result[prop] = buildExampleValue(childSchema, prop)
    }

    if (
      key &&
      schema.properties?.[key] !== undefined &&
      result[key] === undefined
    ) {
      result[key] = buildExampleValue(schema.properties[key]!, key)
    }

    return result
  }

  if (type === 'array') {
    if (!schema.items) return []
    return [buildExampleValue(schema.items, key)]
  }

  return examplePrimitiveValue(schema, key)
}

function buildEnumSchema(
  values: Array<string | number | boolean>
): z.ZodTypeAny {
  if (values.length === 1) return z.literal(values[0]!)
  if (values.every(value => typeof value === 'string')) {
    return z.enum(values as [string, ...string[]])
  }

  return z.union(
    values.map(value => z.literal(value)) as [
      z.ZodLiteral<string | number | boolean>,
      z.ZodLiteral<string | number | boolean>,
      ...Array<z.ZodLiteral<string | number | boolean>>,
    ]
  )
}

function buildRuntimeSchema(schema: SchemaNode): z.ZodTypeAny {
  const cached = schemaCache.get(schema)
  if (cached) return cached

  let runtimeSchema: z.ZodTypeAny
  const type = schema.type ?? (schema.properties ? 'object' : undefined)

  if (schema.enum?.length) {
    runtimeSchema = buildEnumSchema(schema.enum)
  } else if (type === 'object') {
    const shape: Record<string, z.ZodTypeAny> = {}
    const required = new Set(schema.required ?? [])

    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      const child = buildRuntimeSchema(childSchema)
      shape[key] = required.has(key) ? child : child.optional()
    }

    runtimeSchema = z
      .object(shape)
      .passthrough()
      .superRefine((value, ctx) => {
        if (!isPlainObject(value)) return

        for (const key of Object.keys(value)) {
          if (schema.properties?.[key] !== undefined) continue
          if (isSafeUnknownKey(key)) continue

          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${formatPath('args', key)} is not a supported argument`,
          })
        }
      })
  } else if (type === 'array') {
    runtimeSchema = z.array(
      schema.items ? buildRuntimeSchema(schema.items) : z.unknown()
    )
  } else if (type === 'string') {
    runtimeSchema = z.string()
  } else if (type === 'number') {
    runtimeSchema = z.number()
  } else if (type === 'boolean') {
    runtimeSchema = z.boolean()
  } else {
    runtimeSchema = z.unknown()
  }

  schemaCache.set(schema, runtimeSchema)
  return runtimeSchema
}

function issueToFailure(issue: z.ZodIssue): ValidationFailure {
  const path = formatIssuePath(issue.path)

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') {
        return {
          path,
          error: `${path} is required`,
          reason: `The schema marks ${path} as required`,
          received: 'missing',
        }
      }

      return {
        path,
        error: `${path} must be a ${issue.expected}`,
        reason: `Received ${describeValue(issue.received)} instead of a ${
          issue.expected
        }`,
        received: describeValue(issue.received),
      }

    case z.ZodIssueCode.invalid_enum_value:
      return {
        path,
        error: `${path} must be one of ${formatEnumValues(
          issue.options as Array<string | number | boolean>
        )}`,
        reason: `Received ${describeValue(
          issue.received
        )} instead of ${formatEnumValues(
          issue.options as Array<string | number | boolean>
        )}`,
        allowedValues: (issue.options as Array<string | number | boolean>).map(
          value => JSON.stringify(value)
        ),
        received: describeValue(issue.received),
      }

    case z.ZodIssueCode.custom:
      return {
        path,
        error: issue.message,
        reason: issue.message,
        received: 'unsupported',
      }

    default:
      return {
        path,
        error: `${path} is invalid`,
        reason: issue.message,
        received: issue.message,
      }
  }
}

function buildRecoverySuggestion(
  toolName: string,
  failure: ValidationFailure,
  exampleArgs: Record<string, unknown>
): string {
  const hint = RECOVERY_HINTS[`${toolName}:${failure.path}`]
  const exampleCall = `${toolName}(${JSON.stringify(exampleArgs)})`

  if (hint) {
    return `${hint}. Retry ${exampleCall}`
  }

  return `Retry ${exampleCall}`
}

export function validateToolArgs(
  toolName: string,
  definition: ToolDefinition | undefined,
  args: Record<string, unknown>
): ReturnType<typeof createError> | null {
  const parameters = definition?.function.parameters as SchemaNode | undefined
  if (!parameters) return null

  const result = buildRuntimeSchema(parameters).safeParse(args)
  if (result.success) return null

  const failure = issueToFailure(result.error.issues[0]!)
  const focusKey =
    failure.path === 'args'
      ? undefined
      : failure.path.replace(/^args\.?/, '').match(/^[^.[\]]+/)?.[0]

  return createError(
    `Invalid tool arguments for ${toolName}: ${failure.error}`,
    `Schema validation failed for ${failure.path}; received ${failure.received}`,
    buildRecoverySuggestion(
      toolName,
      failure,
      buildExampleValue(parameters, focusKey) as Record<string, unknown>
    )
  )
}

export function buildToolCallExamples(
  definitions: Array<ToolDefinition>,
  limit = 5
): string {
  return definitions
    .slice(0, limit)
    .map(definition => {
      const exampleArgs = buildExampleValue(
        definition.function.parameters as SchemaNode
      ) as Record<string, unknown>
      return `${definition.function.name}(${JSON.stringify(exampleArgs)})`
    })
    .join('; ')
}
