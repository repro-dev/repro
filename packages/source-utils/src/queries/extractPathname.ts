/**
 * Safely extract the pathname from a URL string.
 * Falls back to the raw URL if parsing fails.
 */
export function extractPathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
