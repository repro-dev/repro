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
 *   enabled + null limit  → "Unlimited"
 *   enabled + number      → `${limit} ${noun}` (bare number when noun is empty)
 */
function makeFormatter(noun: string): EntitlementMeta['valueFormatter'] {
  return entitlement => {
    if (!entitlement || !entitlement.enabled) return 'Not included'
    if (entitlement.limit === null) return 'Unlimited'
    return noun ? `${entitlement.limit} ${noun}` : String(entitlement.limit)
  }
}

const ENTITLEMENT_META: Record<string, EntitlementMeta> = {
  recordings: {
    label: 'Recordings',
    description: 'Browser sessions you can capture',
    valueFormatter: makeFormatter('recordings'),
  },
  seats: {
    label: 'Team Seats',
    description: 'Members in your workspace',
    valueFormatter: makeFormatter('seats'),
  },
  ai_credits: {
    label: 'AI Credits',
    description: 'Monthly AI-assisted debugging credits',
    valueFormatter: makeFormatter('AI credits'),
  },
  priority_support: {
    label: 'Priority Support',
    description: 'Dedicated support channel',
    // Boolean gate only — never has a numeric limit in practice
    valueFormatter: makeFormatter(''),
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
