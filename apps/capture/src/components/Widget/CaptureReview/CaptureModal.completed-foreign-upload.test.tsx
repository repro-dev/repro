import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { Future, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import {
  enterReport,
  modalTree,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  sessionListeners,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

function setSession(id: string) {
  act(() => {
    testState.currentSession = { id }
    ;[...sessionListeners].forEach(listener => listener())
  })
}

describe(
  'CaptureModal completed foreign upload privacy',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('locks a completed closed upload to its owner and preserves Open in Repro', async () => {
      let finishProgress: (() => void) | null = null
      testState.enqueueResponse = () => resolve('owner-upload-ref')
      testState.progressResponse = () =>
        Future((_reject, resolveResponse) => {
          finishProgress = () =>
            resolveResponse({
              ref: 'owner-upload-ref',
              recordingId: 'recording-1',
              encryptionKey: null,
              stages: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
              completed: true,
              error: null,
            })
          return () => {}
        })

      const view = render(modalTree(true))
      await selectReportProject('MVP Pilot')
      enterReport('Account A completed report', 'Private report description.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      await waitFor(() => assert.equal(typeof finishProgress, 'function'))

      view.rerender(modalTree(false))
      act(() => finishProgress!())
      setSession('session-2')
      view.rerender(modalTree(true))

      await screen.findByText(/This upload belongs to another account/)
      assert.equal(screen.queryByLabelText('Report project'), null)
      assert.equal(screen.queryByRole('textbox', { name: 'Title' }), null)
      assert.equal(
        screen.queryByDisplayValue('Account A completed report'),
        null
      )
      assert.equal(screen.queryByText('MVP Pilot'), null)
      assert.equal(screen.queryByPlaceholderText('What did you record?'), null)

      const saveTrigger = screen.getByText('Save').closest('button')
      assert.ok(saveTrigger)
      assert.equal((saveTrigger as HTMLButtonElement).disabled, true)

      setSession('session-1')
      await screen.findByRole('button', { name: 'Open in Repro' })
    })
  }
)
