/**
 * Filter null/undefined values from an attribute record,
 * producing a `Record<string, string>` suitable for JSON output.
 */
export function filterNullAttributes(
  attributes: Record<string, string | null | undefined>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value != null) result[key] = value
  }
  return result
}
