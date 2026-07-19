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

/**
 * Merges a partial override into a base RedactionConfig.
 *
 * **Semantic contract (post-REP-1275):** replacement-on-explicit-field. Any
 * field explicitly set in `overrides` replaces the base value entirely;
 * fields absent in `overrides` keep the base default. This allows the `off`
 * preset to clear PII fields (empty arrays/sets) while preserving the
 * credential floor (sensitiveHeaderNames omitted from the override, so the
 * base DEFAULT persists). The previous additive-union contract has been
 * removed — there are no additive consumers. Sole caller is
 * `setRedactionConfig()`.
 */
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
