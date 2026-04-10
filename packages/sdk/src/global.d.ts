declare global {
  interface Window {
    __REPRO__?: {
      identify?: (userId: string, traits?: Record<string, unknown>) => void
      mark?: (name: string, data?: Record<string, unknown>) => void
      captureState?: (component: string, state: Record<string, unknown>) => void
    }
  }
}

// Required to make `declare global` work in a module context
export {}
