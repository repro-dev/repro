/**
 * Strip trailing null bytes from binary-codec-encoded IDs.
 * Binary codec encodes strings with fixed-width null-byte padding
 * that must be removed for Set membership and string comparisons.
 */
export function normalizeId(id: string): string {
  return id.replace(/\0+$/, '')
}
