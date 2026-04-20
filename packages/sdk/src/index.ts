/// <reference path="./global.d.ts" />

import { mark } from './mark'

declare global {
  interface ReproExtension {
    mark?: (name: string, data?: Record<string, unknown>) => void
    captureState?: (component: string, state: Record<string, unknown>) => void
  }

  interface Window {
    __REPRO__?: ReproExtension
  }
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
   * Record a named event with optional metadata.
   * No-op when the Repro extension is not present.
   */
  mark,

  /**
   * Attach component state to the current recording snapshot.
   * No-op when the Repro extension is not present.
   *
   * @experimental This API is a proof of concept. Do not wire into Repro until
   * the SDK is properly spec'd. A plugin architecture (e.g. `@repro/sdk-plugin-react`)
   * that auto-instruments framework APIs may supersede this manual approach.
   * See REP-798 for the exploration issue.
   */
  captureState(component: string, state: Record<string, unknown>): void {
    getExtension()?.captureState?.(component, state)
  },
}

export { mark }
