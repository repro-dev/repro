import type { RedactionConfig } from './types'

/**
 * Per-preset override of redaction and masking config.
 *
 * - `maskedSelectors` — CSS selectors to treat as masked for the recording engine.
 *   Elements matching these selectors will have their text/value contents redacted.
 * - `redaction` — Optional partial RedactionConfig overrides. When `undefined`,
 *   the full DEFAULT_REDACTION_CONFIG is used. When provided, these overrides are
 *   merged via mergeRedactionConfig (with empty arrays/sets for off preset to
 *   clear non-credential fields while keeping sensitiveHeaderNames).
 * - `maskImages` — Whether `<img>` elements should have their `src` blanked.
 */
export interface RedactionOverride {
  maskedSelectors: Array<string>
  redaction?: Partial<RedactionConfig>
  maskImages: boolean
}

/**
 * Maps a RecordingPrivacyPreset to its corresponding RedactionOverride.
 *
 * Each call returns a fresh, non-shared object.
 *
 * | Preset   | maskedSelectors                                              | redaction         | maskImages |
 * |----------|--------------------------------------------------------------|-------------------|-----------|
 * | strict   | .repro-mask, input, textarea, select, [contenteditable], img | undefined (full)  | true      |
 * | standard | .repro-mask                                                  | undefined (full)  | false     |
 * | off      | []                                                           | clears PII fields | false     |
 *
 * @param preset - The privacy preset ('strict' | 'standard' | 'off')
 * @returns A fresh RedactionOverride object
 */
export function toRedactionOverrides(preset: string): RedactionOverride {
  switch (preset) {
    case 'strict':
      return {
        maskedSelectors: [
          '.repro-mask',
          'input',
          'textarea',
          'select',
          '[contenteditable]',
          'img',
        ],
        redaction: undefined,
        maskImages: true,
      }

    case 'standard':
      return {
        maskedSelectors: ['.repro-mask'],
        redaction: undefined,
        maskImages: false,
      }

    case 'off':
      return {
        maskedSelectors: [],
        redaction: {
          // Clear non-credential PII detector config while keeping
          // sensitiveHeaderNames (auth header credential floor)
          sensitiveFieldPatterns: [],
          sensitiveValuePatterns: [],
          sensitiveInputTypes: new Set(),
        },
        maskImages: false,
      }

    default:
      // Fail-safe: unrecognized preset → standard behavior
      return {
        maskedSelectors: ['.repro-mask'],
        redaction: undefined,
        maskImages: false,
      }
  }
}
