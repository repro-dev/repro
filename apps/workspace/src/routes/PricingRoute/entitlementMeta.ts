import { BillingEntitlement } from '@repro/domain'

export interface EntitlementMeta {
  /** Human-friendly display name, e.g. "AI Credits" */
  label: string
  /** Short explanatory string shown below the label; empty string for unknown keys */
  description: string
  /**
   * Formats the entitlement value for display.
   * Receives the BillingEntitlement for this feature from the plan
   * (undefined when the feature is absent from the plan entirely).
   */
  valueFormatter: (entitlement: BillingEntitlement | undefined) => string
}

/** Title-cases an underscore_separated key for use as a fallback label. */
function toTitleCase(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Returns a formatter that produces:
 *   undefined / disabled  → "Not included"
 *   enabled + limit === 0 → "Not included" (sentinel: excluded despite enabled flag)
 *   enabled + null limit  → "Unlimited"
 *   enabled + number      → `${limit} ${noun}` with singular/plural support
 *                           (bare number when noun is empty string)
 */
function makeFormatter(
  noun: string | { singular: string; plural: string }
): EntitlementMeta['valueFormatter'] {
  const rules = new Intl.PluralRules('en')
  return entitlement => {
    if (!entitlement || !entitlement.enabled) return 'Not included'
    if (entitlement.limit === 0) return 'Not included'
    if (entitlement.limit === null) return 'Unlimited'
    if (!noun) return String(entitlement.limit)
    const resolvedNoun =
      typeof noun === 'string'
        ? noun
        : rules.select(entitlement.limit) === 'one'
        ? noun.singular
        : noun.plural
    return `${entitlement.limit} ${resolvedNoun}`
  }
}

/** Formatter for boolean gates: shows "Included" / "Not included", no quantity. */
const booleanFormatter: EntitlementMeta['valueFormatter'] = entitlement => {
  if (!entitlement || !entitlement.enabled) return 'Not included'
  return 'Included'
}

const ENTITLEMENT_META: Record<string, EntitlementMeta> = {
  recordings: {
    label: 'Recordings',
    description: 'Browser sessions you can capture',
    valueFormatter: makeFormatter({
      singular: 'recording',
      plural: 'recordings',
    }),
  },
  seats: {
    label: 'Team Seats',
    description: 'Members in your workspace',
    valueFormatter: makeFormatter({ singular: 'seat', plural: 'seats' }),
  },
  ai_credits: {
    label: 'AI Credits',
    description: 'Monthly AI-assisted debugging credits',
    valueFormatter: makeFormatter({
      singular: 'AI credit',
      plural: 'AI credits',
    }),
  },
  priority_support: {
    label: 'Priority Support',
    description: 'Dedicated support channel',
    // Boolean gate — never has a numeric limit; shows "Included" when enabled
    valueFormatter: booleanFormatter,
  },
}

/**
 * Returns display metadata for a feature key.
 * Falls back gracefully for unknown keys: title-cases the key, empty description,
 * formatter uses plain number (no noun) so the page never breaks.
 */
export function getEntitlementMeta(feature: string): EntitlementMeta {
  return (
    ENTITLEMENT_META[feature] ?? {
      label: toTitleCase(feature),
      description: '',
      valueFormatter: makeFormatter(''),
    }
  )
}
