const MAX_RUNTIME_BUFFER_SIZE = 5_000

export function appendRuntimeBuffer(event: DataView) {
  window.__REPRO_RUNTIME_BUFFER__ ??= []

  const runtimeBuffer = window.__REPRO_RUNTIME_BUFFER__

  // Drop the oldest pre-UI event so the runtime buffer stays bounded.
  if (runtimeBuffer.length >= MAX_RUNTIME_BUFFER_SIZE) {
    runtimeBuffer.shift()
  }

  runtimeBuffer.push(event)
}

export function clearRuntimeBuffer() {
  if (window.__REPRO_RUNTIME_BUFFER__) {
    window.__REPRO_RUNTIME_BUFFER__.length = 0
  }
}
