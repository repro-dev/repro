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
  return {
    sensitiveHeaderNames:
      overrides.sensitiveHeaderNames !== undefined
        ? new Set(overrides.sensitiveHeaderNames)
        : base.sensitiveHeaderNames,
    sensitiveFieldPatterns:
      overrides.sensitiveFieldPatterns !== undefined
        ? [...overrides.sensitiveFieldPatterns]
        : base.sensitiveFieldPatterns,
    sensitiveValuePatterns:
      overrides.sensitiveValuePatterns !== undefined
        ? [...overrides.sensitiveValuePatterns]
        : base.sensitiveValuePatterns,
    sensitiveInputTypes:
      overrides.sensitiveInputTypes !== undefined
        ? new Set(overrides.sensitiveInputTypes)
        : base.sensitiveInputTypes,
    maskedSelectors:
      overrides.maskedSelectors !== undefined
        ? [...overrides.maskedSelectors]
        : base.maskedSelectors,
  }
}
