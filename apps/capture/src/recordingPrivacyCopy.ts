import type { RedactionOverride } from '@repro/recording'

/**
 * Shared preset copy used by both PrivacyIndicator (capture widget) and
 * CaptureReview (pre-share notice). Single source of truth so labeling
 * and masking summaries stay consistent across surfaces.
 *
 * Aligned with PRESET_OPTIONS in RecordingPrivacySettingsRoute.tsx.
 */
export function describePreset(override: RedactionOverride): {
  label: string
  summary: string
} {
  if (override.maskImages) {
    return {
      label: 'Strict',
      summary:
        'Masks all input elements, textareas, contenteditable regions, and <img> elements by default. Auth headers and PII-like values are also automatically redacted.',
    }
  }

  if (override.maskedSelectors.length === 0) {
    return {
      label: 'Off',
      summary:
        'Minimal filtering — only authentication headers (cookies, authorization tokens) are redacted. All other page content is captured as-is.',
    }
  }

  return {
    label: 'Standard',
    summary:
      'Respects .repro-ignore (exclude element) and .repro-mask (mask contents) CSS classes. Sensitive input types (password, credit card) and PII-like values are automatically redacted.',
  }
}
