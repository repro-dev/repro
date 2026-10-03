import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import {
  enterReport,
  intents,
  renderModal,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  sessionListeners,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

const saveWarning =
  'The recording may already be in your project. Check before retrying; retrying anyway may create a duplicate.'
const reportWarning =
  'This report may already be in your project. Check before retrying to avoid a duplicate.'

function switchAccount(id: string) {
  testState.currentSession = { id }
  act(() => [...sessionListeners].forEach(listener => listener()))
}

describe(
  'CaptureModal unknown-status retry regressions',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('restores Save Recording unknown status after rejected and thrown retries', async () => {
      let enqueueAttempts = 0
      testState.enqueueResponse = () => {
        enqueueAttempts++
        if (enqueueAttempts === 1) return resolve('upload-ref-1')
        if (enqueueAttempts === 2) return reject(new Error('retry rejected'))
        throw new Error('retry threw')
      }
      testState.progressResponse = () => resolve(null)

      renderModal()
      fireEvent.click(screen.getByText('Save'))
      let popover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(popover).getByLabelText('Select project'))
      const projects = await screen.findAllByText('MVP Pilot')
      fireEvent.click(projects[projects.length - 1]!)
      fireEvent.input(
        within(popover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Uncertain save title' } }
      )
      fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))
      assert.ok(await screen.findByText(saveWarning, {}, { timeout: 15_000 }))
      assert.equal(uploadEnqueueCount(), 1)

      const assertSaveRetryState = async (expectError = false) => {
        popover = await screen.findByLabelText('Save recording')
        assert.ok(within(popover).getByText(saveWarning))
        if (expectError) {
          assert.ok(
            within(popover).getByText(
              'Recording could not be saved. Your connection may have dropped. Check it and try again.'
            )
          )
        }
        assert.equal(
          (
            within(popover).getByPlaceholderText(
              'What did you record?'
            ) as HTMLInputElement
          ).value,
          'Uncertain save title'
        )
        assert.ok(within(popover).getByText('MVP Pilot'))
        const retry = within(popover).getByRole('button', {
          name: 'Retry save anyway',
        }) as HTMLButtonElement
        assert.equal(retry.disabled, false)
        assert.equal(
          (
            screen.getByRole('button', {
              name: 'Create Bug Report',
            }) as HTMLButtonElement
          ).disabled,
          true
        )
        assert.equal(
          screen.queryByRole('button', { name: 'Retry report' }),
          null
        )
        const lastEnqueue = intents.filter(
          intent => intent.type === 'upload:enqueue'
        )[uploadEnqueueCount() - 1]!
        assert.equal(lastEnqueue.payload.projectId, 'project-1')
        assert.equal(lastEnqueue.payload.title, 'Uncertain save title')
        assert.equal(lastEnqueue.payload.description, null)
        return retry
      }

      fireEvent.click(await assertSaveRetryState())
      await screen.findByText(
        'Recording could not be saved. Your connection may have dropped. Check it and try again.'
      )
      await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
      fireEvent.click(await assertSaveRetryState(true))
      await screen.findByText(
        'Recording could not be saved. Your connection may have dropped. Check it and try again.'
      )
      await waitFor(() => assert.equal(uploadEnqueueCount(), 3))
      await assertSaveRetryState(true)

      switchAccount('other-account')
      assert.ok(screen.getByText(/This upload belongs to another account/))
      assert.equal(screen.queryByDisplayValue('Uncertain save title'), null)
      switchAccount('session-1')
      await assertSaveRetryState(true)
    })

    it('restores report unknown status when an explicit retry throws synchronously', async () => {
      let enqueueAttempts = 0
      testState.enqueueResponse = () => {
        enqueueAttempts++
        if (enqueueAttempts === 1) return resolve('upload-ref-1')
        throw new Error('retry threw')
      }
      testState.progressResponse = () => resolve(null)

      renderModal()
      await selectReportProject('MVP Pilot')
      enterReport('Uncertain report title', 'Retained report details')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      assert.ok(await screen.findByText(reportWarning, {}, { timeout: 15_000 }))
      assert.equal(uploadEnqueueCount(), 1)

      fireEvent.click(
        screen.getByRole('button', { name: 'Retry report anyway' })
      )

      assert.ok(
        await screen.findByText(
          'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
        )
      )
      assert.ok(screen.getByText(reportWarning))
      assert.equal(uploadEnqueueCount(), 2)
      const retryIntent = intents.filter(
        intent => intent.type === 'upload:enqueue'
      )[1]!
      assert.equal(retryIntent.payload.projectId, 'project-1')
      assert.equal(retryIntent.payload.title, 'Uncertain report title')
      assert.equal(retryIntent.payload.description, 'Retained report details')
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        'Uncertain report title'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'Retained report details'
      )
      assert.ok(
        screen
          .getByLabelText('Report project')
          .textContent?.includes('MVP Pilot')
      )
      assert.equal(
        (
          screen.getByRole('button', {
            name: 'Retry report anyway',
          }) as HTMLButtonElement
        ).disabled,
        false
      )
      assert.equal(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
        true
      )

      switchAccount('other-account')
      assert.ok(screen.getByText(/This upload belongs to another account/))
      assert.equal(screen.queryByDisplayValue('Uncertain report title'), null)
      switchAccount('session-1')
      await waitFor(() => assert.ok(screen.getByText(reportWarning)))
      assert.equal(
        (
          screen.getByRole('button', {
            name: 'Retry report anyway',
          }) as HTMLButtonElement
        ).disabled,
        false
      )
    })
  }
)
