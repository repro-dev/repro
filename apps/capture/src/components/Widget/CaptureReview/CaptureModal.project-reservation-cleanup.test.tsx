import { PortalRootProvider } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Future, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import {
  enterReport,
  intents,
  playback,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  sessionListeners,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureReview } =
  require('./CaptureReview') as typeof import('./CaptureReview')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SaveRecordingPopover } =
  require('./SaveRecordingPopover') as typeof import('./SaveRecordingPopover')

function reservationTree(showReport: boolean, showSave: boolean) {
  return (
    <PortalRootProvider>
      <CaptureUploadProvider
        open
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={60_000}
      >
        {showReport && (
          <CaptureReview
            onClose={() => {}}
            playback={playback}
            recordingMode={RecordingMode.Snapshot}
            selectedDuration={60_000}
            setSelectedDuration={() => {}}
            privacyOverrides={{ maskedSelectors: [], ignoredSelectors: [] }}
          />
        )}
        {showSave && <SaveRecordingPopover isAuthed />}
      </CaptureUploadProvider>
    </PortalRootProvider>
  )
}

describe(
  'CaptureModal project reservation cleanup',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('releases and cancels Save Recording project creation on account change', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      let projectCreationCancelled = false
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {
              projectCreationCancelled = true
            }
          })
        }
        return resolve({
          items:
            testState.currentSession?.id === 'account-b'
              ? [{ id: 'account-b-project', name: 'Account B project' }]
              : [{ id: 'account-a-project', name: 'Account A project' }],
        })
      }

      render(reservationTree(true, true))
      await selectReportProject('Account A project')
      fireEvent.click(screen.getByText('Save'))
      const popover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(popover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(within(popover).getByPlaceholderText('Project name'), {
        target: { value: 'Account A private project' },
      })
      fireEvent.input(
        within(popover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Account A private title' } }
      )
      fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      assert.equal(
        (
          screen.getByRole('button', {
            name: 'Create Bug Report',
          }) as HTMLButtonElement
        ).disabled,
        true
      )
      testState.currentSession = { id: 'account-b' }
      act(() => [...sessionListeners].forEach(listener => listener()))
      await waitFor(() => assert.equal(projectCreationCancelled, true))

      await selectReportProject('Account B project')
      fireEvent.input(screen.getByPlaceholderText('What is the bug?'), {
        target: { value: 'Account B report' },
      })
      fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
        target: { value: 'Use the new account destination.' },
      })
      const reportSubmit = screen.getByRole('button', {
        name: 'Create Bug Report',
      }) as HTMLButtonElement
      await waitFor(() => assert.equal(reportSubmit.disabled, false))
      fireEvent.click(reportSubmit)

      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const reportIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(reportIntent.payload.projectId, 'account-b-project')
      assert.equal(reportIntent.payload.title, 'Account B report')
      assert.equal(
        reportIntent.payload.description,
        'Use the new account destination.'
      )
      finishProject!({
        id: 'stale-account-a-project',
        name: 'Account A private project',
      })
      assert.equal(uploadEnqueueCount(), 1)
      assert.equal(
        (
          within(popover).getByPlaceholderText(
            'What did you record?'
          ) as HTMLInputElement
        ).value,
        ''
      )
    })

    it('releases and cancels report project creation when its surface unmounts', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      let projectCreationCancelled = false
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {
              projectCreationCancelled = true
            }
          })
        }
        return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
      }

      const view = render(reservationTree(true, true))
      fireEvent.click(await screen.findByLabelText('Report project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Unfinished report project' },
      })
      enterReport('Report after unmount', 'The report surface will close.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      assert.equal(
        (screen.getAllByText('Save')[0]!.closest('button') as HTMLButtonElement)
          .disabled,
        true
      )
      view.rerender(reservationTree(false, true))
      await waitFor(() => assert.equal(projectCreationCancelled, true))
      const saveTrigger = screen.getByText('Save').closest('button')!
      await waitFor(() =>
        assert.equal((saveTrigger as HTMLButtonElement).disabled, false)
      )

      fireEvent.click(saveTrigger)
      const popover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(popover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('MVP Pilot'))
      fireEvent.input(
        within(popover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Save after report unmount' } }
      )
      fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))

      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const saveIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(saveIntent.payload.projectId, 'project-1')
      assert.equal(saveIntent.payload.title, 'Save after report unmount')
      assert.equal(saveIntent.payload.description, null)
      finishProject!({
        id: 'stale-report-project',
        name: 'Unfinished report project',
      })
      assert.equal(uploadEnqueueCount(), 1)
    })

    it('releases and cancels Save Recording project creation when its surface unmounts', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      let projectCreationCancelled = false
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {
              projectCreationCancelled = true
            }
          })
        }
        return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
      }

      const view = render(reservationTree(true, true))
      await selectReportProject('MVP Pilot')
      enterReport('Report after unmount', 'The report remains available.')
      fireEvent.click(screen.getByText('Save'))
      const popover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(popover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(within(popover).getByPlaceholderText('Project name'), {
        target: { value: 'Unfinished save project' },
      })
      fireEvent.input(
        within(popover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Save title discarded on unmount' } }
      )
      fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      const reportSubmit = screen.getByRole('button', {
        name: 'Create Bug Report',
      }) as HTMLButtonElement
      assert.equal(reportSubmit.disabled, true)
      view.rerender(reservationTree(true, false))
      await waitFor(() => assert.equal(projectCreationCancelled, true))
      await waitFor(() => assert.equal(reportSubmit.disabled, false))
      assert.equal(uploadEnqueueCount(), 0)
      fireEvent.click(reportSubmit)

      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const reportIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(reportIntent.payload.projectId, 'project-1')
      assert.equal(reportIntent.payload.title, 'Report after unmount')
      assert.equal(
        reportIntent.payload.description,
        'The report remains available.'
      )
      finishProject!({
        id: 'stale-save-project',
        name: 'Unfinished save project',
      })
      assert.equal(uploadEnqueueCount(), 1)
    })
  }
)
