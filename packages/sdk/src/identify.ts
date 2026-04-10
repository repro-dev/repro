import {
  getReproGlobal,
  type ReproIdentify,
  type ReproPayload,
} from './reproGlobal'

function getIdentify(): ReproIdentify | undefined {
  const identify = getReproGlobal()?.identify

  return typeof identify === 'function' ? identify : undefined
}

/**
 * Identify a user by ID with optional traits (e.g. plan, email).
 * Bridges into globalThis.__REPRO__.identify when the Repro extension is present.
 * No-op when the extension is absent.
 */
export function identify(userId: string, traits?: ReproPayload): void {
  getIdentify()?.(userId, traits)
}
