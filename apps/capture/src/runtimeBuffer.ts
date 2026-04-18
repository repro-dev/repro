export function clearRuntimeBuffer() {
  if (window.__REPRO_RUNTIME_BUFFER__) {
    window.__REPRO_RUNTIME_BUFFER__.length = 0
  }
}
