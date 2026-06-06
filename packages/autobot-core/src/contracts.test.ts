import assert from 'node:assert/strict'
import test from 'node:test'

import {
  itemStates,
  nonTerminalItemStates,
  terminalItemStates,
  workerLifecycleStates,
} from './index'

test('escalated is a public terminal item state', () => {
  assert.equal(itemStates.includes('escalated'), true)
  assert.equal(nonTerminalItemStates.includes('escalated'), false)
  assert.deepEqual(terminalItemStates, ['escalated', 'completed', 'canceled'])
})

test('worker lifecycle states stay durable and bounded', () => {
  assert.deepEqual(workerLifecycleStates, [
    'starting',
    'running',
    'completed',
    'failed',
    'canceled',
    'stale',
  ])
})
