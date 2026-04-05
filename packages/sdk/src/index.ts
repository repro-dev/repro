/**
 * The shape of the Repro extension injected into window by the browser extension.
 * All methods are optional so stubs can safely check for individual capabilities.
 */
interface ReproExtension {
  identify(userId: string, traits?: Record<string, unknown>): void
  mark(name: string, data?: Record<string, unknown>): void
  captureState(component: string, state: Record<string, unknown>): void
}

// Access the extension via globalThis so this module works in both browser and
// Node.js test environments without referencing `window` directly.
function getExtension(): ReproExtension | undefined {
  return (globalThis as Record<string, unknown>)['__REPRO__'] as
    | ReproExtension
    | undefined
}

export const repro = {
  /**
   * Associate the current session with a known user.
   * No-op when the Repro extension is not present.
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    getExtension()?.identify(userId, traits)
  },

  /**
   * Record a named event with optional metadata.
   * No-op when the Repro extension is not present.
   */
  mark(name: string, data?: Record<string, unknown>): void {
    getExtension()?.mark(name, data)
  },

  /**
   * Attach component state to the current recording snapshot.
   * No-op when the Repro extension is not present.
   */
  captureState(component: string, state: Record<string, unknown>): void {
    getExtension()?.captureState(component, state)
  },
}
