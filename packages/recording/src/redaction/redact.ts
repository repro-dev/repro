import { Stats, StatsLevel } from '@repro/diagnostics'
import { DEFAULT_REDACTION_CONFIG, mergeRedactionConfig } from './config'
import { validateCreditCard } from './patterns'
import {
  PiiCategory,
  type DetectionResult,
  type RedactionConfig,
} from './types'

export const MASKED_VALUE = '[MASKED]'

let currentConfig: RedactionConfig = DEFAULT_REDACTION_CONFIG

export function setRedactionConfig(overrides?: Partial<RedactionConfig>): void {
  if (overrides) {
    currentConfig = mergeRedactionConfig(DEFAULT_REDACTION_CONFIG, overrides)
  } else {
    currentConfig = DEFAULT_REDACTION_CONFIG
  }
}

export function redactText(value: string): string {
  return Stats.timeMean(
    'Redaction~redactText',
    () => {
      return Array.from(value, char => (/\s/u.test(char) ? char : '*')).join('')
    },
    StatsLevel.Debug
  )
}

export function isSensitiveKey(key: string): boolean {
  return Stats.timeMean(
    'Redaction~isSensitiveKey',
    () => {
      const lowerKey = key.toLowerCase()

      if (currentConfig.sensitiveHeaderNames.has(lowerKey)) {
        return true
      }

      for (const pattern of currentConfig.sensitiveFieldPatterns) {
        if (pattern.test(key)) {
          return true
        }
      }

      return false
    },
    StatsLevel.Debug
  )
}

export function detectPii(value: string): DetectionResult {
  return Stats.time(
    'Redaction~detectPii',
    () => {
      for (const pattern of currentConfig.sensitiveValuePatterns) {
        const match = pattern.regex.exec(value)
        if (match) {
          // For credit cards, apply Luhn check
          if (pattern.category === PiiCategory.CreditCard) {
            if (!validateCreditCard(match[0])) {
              continue
            }
          }

          Stats.value(
            `Redaction~${pattern.category}Detected`,
            1,
            StatsLevel.Debug
          )

          return {
            detected: true,
            pattern: pattern.regex,
            category: pattern.category,
          }
        }
      }

      return { detected: false }
    },
    StatsLevel.Debug
  )
}

function containsPii(value: string): boolean {
  return detectPii(value).detected
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    if (containsPii(value)) {
      return MASKED_VALUE
    }
    return value
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

export function redactValue(value: unknown): unknown {
  return Stats.time(
    'Redaction~redactValue',
    () => redactUnknown(value, new WeakSet<object>()),
    StatsLevel.Debug
  )
}

export function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Stats.time(
    'Redaction~redactHeaders',
    () => {
      return Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [
          key,
          isSensitiveKey(key) ? MASKED_VALUE : value,
        ])
      )
    },
    StatsLevel.Debug
  )
}

export function redactUrl(url: string): string {
  return Stats.time(
    'Redaction~redactUrl',
    () => {
      try {
        const parsed = new URL(url)

        if (parsed.search) {
          // Work at the string level rather than URLSearchParams to
          // preserve original parameter ordering and encoding.
          const parts = parsed.search.slice(1).split('&')
          const redactedParts = parts.map(part => {
            const eqIdx = part.indexOf('=')
            if (eqIdx === -1) return part
            const key = part.slice(0, eqIdx)
            const decodedKey = decodeURIComponent(key)
            if (isSensitiveKey(decodedKey)) {
              return `${key}=${MASKED_VALUE}`
            }
            return part
          })
          parsed.search = redactedParts.join('&')
        }

        return parsed.toString()
      } catch {
        return url
      }
    },
    StatsLevel.Debug
  )
}

export function isSensitiveInputType(inputType: string): boolean {
  return currentConfig.sensitiveInputTypes.has(inputType)
}
