import type { ReproGlobal } from './reproGlobal'

declare global {
  interface Window {
    __REPRO__?: ReproGlobal
  }
}

// Required to make `declare global` work in a module context
export {}
