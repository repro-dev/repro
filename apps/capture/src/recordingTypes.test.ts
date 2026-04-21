import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createRecordingTypes } from './recordingTypes'

it('excludes framework state by default', () => {
  assert.deepEqual(
    [...createRecordingTypes()],
    ['dom', 'interaction', 'network', 'console', 'performance']
  )
})

it('allows framework state to be opted back in explicitly', () => {
  assert.deepEqual(
    [...createRecordingTypes({ includeState: true })],
    ['dom', 'interaction', 'network', 'console', 'performance', 'state']
  )
})

it('keeps runtime-installed observer types filtered while preserving the opt-in path', () => {
  assert.deepEqual(
    [
      ...createRecordingTypes({
        includeState: true,
        runtimeInstalledTypes: new Set(['console', 'performance']),
      }),
    ],
    ['dom', 'interaction', 'network', 'state']
  )
})
