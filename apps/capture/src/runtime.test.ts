import 'global-jsdom/register'

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { installRuntime, installRuntimeObservers } from './runtime'
import { appendRuntimeBuffer, clearRuntimeBuffer } from './runtimeBuffer'

it('installRuntime is idempotent', () => {
  const buffer = window.__REPRO_RUNTIME_BUFFER__
  const installedTypes = window.__REPRO_RUNTIME_INSTALLED_TYPES__

  installRuntime()

  assert.equal(window.__REPRO_RUNTIME_BUFFER__, buffer)
  assert.equal(window.__REPRO_RUNTIME_INSTALLED_TYPES__, installedTypes)
  assert.equal(window.__REPRO_RUNTIME_INSTALLED__, true)
})

it('registers only custom observer type after installRuntime', () => {
  const installedTypes = window.__REPRO_RUNTIME_INSTALLED_TYPES__
  assert.ok(installedTypes)
  assert.ok(installedTypes.has('custom'))
  assert.equal(installedTypes.size, 1)
})

it('installRuntimeObservers installs React hook stub and all observers', () => {
  const logBefore = console.log
  const fetchBefore = globalThis.fetch

  installRuntimeObservers({
    types: new Set(['network', 'performance', 'console']),
  })

  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

  assert.ok(hook)
  assert.equal(hook?.supportsFiber, true)
  assert.ok(hook?.renderers instanceof Map)

  const rendererId = hook!.inject({ name: 'renderer' })
  assert.equal(rendererId, 0)
  assert.deepEqual(hook!.renderers.get(rendererId), { name: 'renderer' })

  let payloadCount = 0
  const listener = (value: unknown) => {
    if (value === 'payload') payloadCount += 1
  }
  hook!.on('ping', listener)
  hook!.emit('ping', 'payload')
  hook!.off('ping', listener)
  hook!.emit('ping', 'payload')
  assert.equal(payloadCount, 1)

  const installedTypes = window.__REPRO_RUNTIME_INSTALLED_TYPES__
  assert.ok(installedTypes)
  assert.ok(installedTypes.has('console'))
  assert.ok(installedTypes.has('network'))
  assert.ok(installedTypes.has('performance'))
  assert.ok(installedTypes.has('custom'))
  assert.equal(installedTypes.size, 4)

  assert.notEqual(console.log, logBefore)
  assert.notEqual(globalThis.fetch, fetchBefore)
})

it('does not re-wrap global patches on repeated installRuntimeObservers() calls', () => {
  const installedTypes = window.__REPRO_RUNTIME_INSTALLED_TYPES__
  const logBefore = console.log
  const fetchBefore = globalThis.fetch
  const xhrBefore = globalThis.XMLHttpRequest

  installRuntimeObservers({
    types: new Set(['network', 'performance', 'console']),
  })

  assert.equal(window.__REPRO_RUNTIME_INSTALLED_TYPES__, installedTypes)
  assert.equal(installedTypes?.size, 4)
  assert.equal(console.log, logBefore)
  assert.equal(globalThis.fetch, fetchBefore)
  assert.equal(globalThis.XMLHttpRequest, xhrBefore)
})

it('forwards live runtime events to the active sink without refilling the buffer', () => {
  const forwarded: Array<DataView> = []

  window.__REPRO_RUNTIME_BUFFER__ = []
  window.__REPRO_RUNTIME_BUFFER_SINK__ = event => {
    forwarded.push(event)
  }

  window.__REPRO_RUNTIME_BUFFER_SINK__(new DataView(new ArrayBuffer(4)))

  assert.equal(forwarded.length, 1)
  assert.equal(window.__REPRO_RUNTIME_BUFFER__?.length, 0)

  window.__REPRO_RUNTIME_BUFFER_SINK__ = undefined
})

it('evicts the oldest runtime buffer entries when the cap is reached', () => {
  window.__REPRO_RUNTIME_BUFFER__ = []

  for (let index = 0; index <= 10_000; index += 1) {
    appendRuntimeBuffer(new DataView(Uint8Array.of(index % 256).buffer))
  }

  assert.equal(window.__REPRO_RUNTIME_BUFFER__?.length, 10_000)
  const runtimeBuffer = window.__REPRO_RUNTIME_BUFFER__

  assert.ok(runtimeBuffer)
  assert.ok(runtimeBuffer[0])
  assert.equal(new Uint8Array(runtimeBuffer[0].buffer)[0], 1)

  clearRuntimeBuffer()
})

it('clears the runtime buffer when disconnecting the recording', () => {
  window.__REPRO_RUNTIME_BUFFER__ = [new DataView(new ArrayBuffer(1))]

  clearRuntimeBuffer()

  assert.equal(window.__REPRO_RUNTIME_BUFFER__?.length, 0)
})
