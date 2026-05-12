function getExtension(): ReproExtension | undefined {
  const extension = (globalThis as unknown as Window).__REPRO__

  if (!extension || typeof extension !== 'object') {
    return undefined
  }

  return extension
}

export function mark(name: string, data?: Record<string, unknown>): void {
  const extension = getExtension()

  if (typeof extension?.mark !== 'function') {
    return
  }

  extension.mark(name, data)
}
