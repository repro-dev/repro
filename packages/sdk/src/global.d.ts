declare global {
  interface ReproExtension {
    mark?: (name: string, data?: Record<string, unknown>) => void
    captureState?: (component: string, state: Record<string, unknown>) => void
  }

  interface Window {
    __REPRO__?: ReproExtension
  }
}

export {}
