import { getReproGlobal, type ReproPayload } from './reproGlobal'

export { identify } from './identify'

export const repro = {
  /**
   * Record a named event with optional metadata.
   * No-op when the Repro extension is not present.
   */
  mark(name: string, data?: ReproPayload): void {
    getReproGlobal()?.mark?.(name, data)
  },

  /**
   * Attach component state to the current recording snapshot.
   * No-op when the Repro extension is not present.
   *
   * @experimental This API is a proof of concept. Do not wire into Repro until
   * the SDK is properly spec'd. A plugin architecture (e.g. `@repro/sdk-plugin-react`)
   * that auto-instruments framework APIs may supersede this manual approach.
   * See REP-798 for the exploration issue.
   */
  captureState(component: string, state: ReproPayload): void {
    getReproGlobal()?.captureState?.(component, state)
  },
}
