export const MASKED_VALUE = '[MASKED]'

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
])

const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|cookie|set-cookie|password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)/i

const SECRET_VALUE_PATTERN =
  /(?:\b(?:authorization|cookie|set-cookie|password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*[^,\s"'`]+)|(?:\bbearer\s+[A-Za-z0-9\-._~+/]+=*)/i

function isSensitiveKey(key: string) {
  return (
    SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ||
    SENSITIVE_FIELD_PATTERN.test(key)
  )
}

function redactString(value: string) {
  return SECRET_VALUE_PATTERN.test(value) ? MASKED_VALUE : value
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactString(value)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return MASKED_VALUE
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map(entry => redactUnknown(entry, seen))
  }

  const redacted: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key)
      ? MASKED_VALUE
      : redactUnknown(entry, seen)
  }

  return redacted
}

export function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? MASKED_VALUE : value,
    ])
  )
}

export function redactConsoleValue(value: unknown): unknown {
  return redactUnknown(value, new WeakSet<object>())
}
