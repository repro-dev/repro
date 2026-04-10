export type ReproPayload = { [key: string]: unknown }

export type ReproIdentify = (userId: string, traits?: ReproPayload) => void

export interface ReproGlobal {
  identify?: ReproIdentify
  mark?: (name: string, data?: ReproPayload) => void
  captureState?: (component: string, state: ReproPayload) => void
}

export function getReproGlobal(): ReproGlobal | undefined {
  const repro = (globalThis as { __REPRO__?: unknown }).__REPRO__

  return typeof repro === 'object' && repro !== null
    ? (repro as ReproGlobal)
    : undefined
}
