import 'global-jsdom/register'

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { installRuntime } from './runtime'

it('installs the runtime hook stub and stays idempotent', () => {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

  assert.ok(hook)

  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    '__REACT_DEVTOOLS_GLOBAL_HOOK__'
  )

  assert.equal(descriptor?.configurable, false)
  assert.equal(descriptor?.writable, false)
  assert.equal(hook?.supportsFiber, true)
  assert.ok(hook?.renderers instanceof Map)

  const rendererId = hook!.inject({ name: 'renderer' })

  assert.equal(rendererId, 0)
  assert.deepEqual(hook!.renderers.get(rendererId), { name: 'renderer' })

  let payloadCount = 0
  const listener = (value: unknown) => {
    if (value === 'payload') {
      payloadCount += 1
    }
  }

  hook!.on('ping', listener)
  hook!.emit('ping', 'payload')
  hook!.off('ping', listener)
  hook!.emit('ping', 'payload')

  assert.equal(payloadCount, 1)

  const buffer = window.__REPRO_RUNTIME_BUFFER__
  const installedTypes = window.__REPRO_RUNTIME_INSTALLED_TYPES__

  installRuntime()

  assert.equal(window.__REPRO_RUNTIME_BUFFER__, buffer)
  assert.equal(window.__REPRO_RUNTIME_INSTALLED_TYPES__, installedTypes)
  assert.equal(window.__REPRO_RUNTIME_INSTALLED__, true)
  assert.ok(installedTypes?.has('console'))
})
