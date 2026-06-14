import { sensitiveFieldPatterns, sensitiveValuePatterns } from './patterns'
import type { RedactionConfig } from './types'

export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  sensitiveHeaderNames: new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'www-authenticate',
    'proxy-authenticate',
    'proxy-authorization',
  ]),
  sensitiveFieldPatterns: sensitiveFieldPatterns.map(p => p.regex),
  sensitiveValuePatterns: sensitiveValuePatterns,
  sensitiveInputTypes: new Set([
    'password',
    'credit-card-number',
    'cvv',
    'card-number',
    'cc-number',
  ]),
  maskedSelectors: [],
}

export function mergeRedactionConfig(
  base: RedactionConfig,
  overrides: Partial<RedactionConfig>
): RedactionConfig {
  const mergedSensitiveHeaderNames = new Set([
    ...base.sensitiveHeaderNames,
    ...(overrides.sensitiveHeaderNames ?? []),
  ])

  const mergedFieldPatterns = [
    ...base.sensitiveFieldPatterns,
    ...(overrides.sensitiveFieldPatterns ?? []),
  ]

  const mergedValuePatterns = [
    ...base.sensitiveValuePatterns,
    ...(overrides.sensitiveValuePatterns ?? []),
  ]

  const mergedInputTypes = new Set([
    ...base.sensitiveInputTypes,
    ...(overrides.sensitiveInputTypes ?? []),
  ])

  const mergedMaskedSelectors = [
    ...base.maskedSelectors,
    ...(overrides.maskedSelectors ?? []),
  ]

  return {
    sensitiveHeaderNames: mergedSensitiveHeaderNames,
    sensitiveFieldPatterns: mergedFieldPatterns,
    sensitiveValuePatterns: mergedValuePatterns,
    sensitiveInputTypes: mergedInputTypes,
    maskedSelectors: mergedMaskedSelectors,
  }
}
