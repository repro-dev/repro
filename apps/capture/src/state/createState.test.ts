import { RecordingMode } from '@repro/domain'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createState } from './createState'
import { ReadyState } from './types'

describe('createState', () => {
  describe('default values', () => {
    it('sets $readyState to ReadyState.Idle by default', () => {
      const state = createState()
      assert.strictEqual(state.$readyState.getValue(), ReadyState.Idle)
    })

    it('sets $recordingMode to RecordingMode.None by default', () => {
      const state = createState()
      assert.strictEqual(state.$recordingMode.getValue(), RecordingMode.None)
    })

    it('sets $projectId to null by default', () => {
      const state = createState()
      assert.strictEqual(state.$projectId.getValue(), null)
    })

    it('sets $recordingId to null by default', () => {
      const state = createState()
      assert.strictEqual(state.$recordingId.getValue(), null)
    })
  })

  describe('initial value overrides', () => {
    it('accepts a custom initial readyState', () => {
      const state = createState({ readyState: ReadyState.Ready })
      assert.strictEqual(state.$readyState.getValue(), ReadyState.Ready)
    })

    it('accepts a custom initial recordingMode', () => {
      const state = createState({ recordingMode: RecordingMode.Replay })
      assert.strictEqual(state.$recordingMode.getValue(), RecordingMode.Replay)
    })

    it('accepts a custom initial projectId', () => {
      const state = createState({ projectId: 'proj-abc' })
      assert.strictEqual(state.$projectId.getValue(), 'proj-abc')
    })

    it('accepts a custom initial recordingId', () => {
      const state = createState({ recordingId: 'rec-xyz' })
      assert.strictEqual(state.$recordingId.getValue(), 'rec-xyz')
    })

    it('applies defaults for fields not provided in partial overrides', () => {
      const state = createState({ projectId: 'proj-123' })
      assert.strictEqual(state.$readyState.getValue(), ReadyState.Idle)
      assert.strictEqual(state.$recordingMode.getValue(), RecordingMode.None)
      assert.strictEqual(state.$recordingId.getValue(), null)
    })
  })

  describe('setters', () => {
    it('setReadyState updates $readyState atom', () => {
      const state = createState()
      state.setReadyState(ReadyState.Pending)
      assert.strictEqual(state.$readyState.getValue(), ReadyState.Pending)
    })

    it('setReadyState can transition through multiple states', () => {
      const state = createState()
      state.setReadyState(ReadyState.Pending)
      assert.strictEqual(state.$readyState.getValue(), ReadyState.Pending)
      state.setReadyState(ReadyState.Ready)
      assert.strictEqual(state.$readyState.getValue(), ReadyState.Ready)
    })

    it('setRecordingMode updates $recordingMode atom', () => {
      const state = createState()
      state.setRecordingMode(RecordingMode.Replay)
      assert.strictEqual(state.$recordingMode.getValue(), RecordingMode.Replay)
    })

    it('setProjectId updates $projectId atom', () => {
      const state = createState()
      state.setProjectId('new-project')
      assert.strictEqual(state.$projectId.getValue(), 'new-project')
    })

    it('setProjectId can set projectId back to null', () => {
      const state = createState({ projectId: 'some-project' })
      state.setProjectId(null)
      assert.strictEqual(state.$projectId.getValue(), null)
    })

    it('setRecordingId updates $recordingId atom', () => {
      const state = createState()
      state.setRecordingId('rec-123')
      assert.strictEqual(state.$recordingId.getValue(), 'rec-123')
    })

    it('setRecordingId can set recordingId back to null', () => {
      const state = createState({ recordingId: 'rec-abc' })
      state.setRecordingId(null)
      assert.strictEqual(state.$recordingId.getValue(), null)
    })

    it('setters on one state instance do not affect another', () => {
      const stateA = createState()
      const stateB = createState()

      stateA.setProjectId('proj-A')

      assert.strictEqual(stateA.$projectId.getValue(), 'proj-A')
      assert.strictEqual(stateB.$projectId.getValue(), null)
    })
  })
})
