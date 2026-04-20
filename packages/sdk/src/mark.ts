function getExtension(): ReproExtension | undefined {
  return (globalThis as unknown as Window).__REPRO__
}

export function mark(name: string, data?: Record<string, unknown>): void {
  getExtension()?.mark(name, data)
}
