// Access the extension via globalThis so this module works in both browser and
// Node.js test environments without referencing `window` directly.
function getIdentify():
  | ((userId: string, traits?: Record<string, unknown>) => void)
  | undefined {
  const repro = (globalThis as Record<string, unknown>)['__REPRO__'] as
    | Record<string, unknown>
    | undefined
  if (repro != null && typeof repro['identify'] === 'function') {
    return repro['identify'] as (
      userId: string,
      traits?: Record<string, unknown>
    ) => void
  }
  return undefined
}

/**
 * Identify a user by ID with optional traits (e.g. plan, email).
 * Bridges into window.__REPRO__.identify when the Repro extension is present.
 * No-op when the extension is absent.
 */
export function identify(
  userId: string,
  traits?: Record<string, unknown>
): void {
  getIdentify()?.(userId, traits)
}
