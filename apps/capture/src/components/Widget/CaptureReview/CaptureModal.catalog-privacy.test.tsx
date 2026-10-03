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
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import {
  enterReport,
  intents,
  playback,
  renderModal,
  resetCaptureModalTestState,
  selectReportProject,
  sessionListeners,
  testState,
  uploadEnqueueCount,
  uploadProgress,
} from './CaptureModal.test-utils'

function setSession(id: string | null) {
  testState.currentSession = id === null ? null : { id }
  act(() => [...sessionListeners].forEach(listener => listener()))
}

describe('CaptureModal project catalog privacy', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  it(
    'hides report projects on logout and clears a create draft on account switch',
    { timeout: 5_000 },
    async () => {
      const createdNames: string[] = []
      let finishAccountThreeCatalog: (() => void) | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          createdNames.push(JSON.parse(options.body ?? '{}').name)
          return resolve({ id: 'created-project', name: 'Private draft' })
        }
        if (testState.currentSession?.id === 'user-2') {
          return resolve({
            items: [{ id: 'user-2-project', name: 'Current account project' }],
          })
        }
        if (testState.currentSession?.id === 'user-3') {
          return Future((_, resolveCatalog) => {
            finishAccountThreeCatalog = () =>
              resolveCatalog({
                items: [
                  { id: 'user-3-project', name: 'Latest account project' },
                ],
              })
            return () => {}
          })
        }
        return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
      }

      renderModal()
      await selectReportProject('MVP Pilot')

      enterReport('Private account A draft', 'Clear this on account change.')
      setSession('user-2')
      assert.equal(screen.queryByDisplayValue('Private account A draft'), null)
      assert.equal(
        screen.queryByDisplayValue('Clear this on account change.'),
        null
      )

      setSession(null)

      assert.equal(screen.queryAllByText('MVP Pilot').length, 0)
      assert.equal(uploadEnqueueCount(), 0)
      enterReport('Signed-out report', 'The project choice must not be reused.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      assert.ok(await screen.findByRole('button', { name: 'Sign in' }))
      assert.equal(uploadEnqueueCount(), 0)

      setSession('user-2')
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        'Signed-out report'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'The project choice must not be reused.'
      )
      fireEvent.click(await screen.findByLabelText('Report project'))
      assert.ok(await screen.findByText('Current account project'))
      fireEvent.click(screen.getByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Private draft' },
      })
      setSession('user-3')
      assert.equal(screen.queryByDisplayValue('Signed-out report'), null)
      assert.equal(
        screen.queryByDisplayValue('The project choice must not be reused.'),
        null
      )
      assert.equal(screen.queryAllByText('Current account project').length, 0)
      assert.equal(screen.queryByDisplayValue('Private draft'), null)
      finishAccountThreeCatalog!()
      fireEvent.click(screen.getByRole('combobox', { name: 'Report project' }))
      assert.ok(await screen.findByText('Latest account project'))
      const submit = screen.getByRole('button', {
        name: 'Create Bug Report',
      }) as HTMLButtonElement
      assert.equal(submit.disabled, true)
      fireEvent.submit(submit.closest('form')!)
      assert.deepEqual(createdNames, [])
      assert.equal(uploadEnqueueCount(), 0)
    }
  )

  it('claims a signed-out report draft for the first authenticated principal', async () => {
    const { CaptureUploadProvider, useCaptureUpload } = await import(
      './CaptureUploadProvider'
    )

    function DraftProbe() {
      const { reportDraft, reportDraftPrincipalId, setReportDraft } =
        useCaptureUpload()
      const principalId = testState.currentSession?.id ?? null
      const visibleDraft =
        reportDraftPrincipalId === null ||
        reportDraftPrincipalId === principalId
          ? reportDraft
          : { title: '', description: '' }

      return (
        <div>
          <output aria-label="Draft title">{visibleDraft.title}</output>
          <output aria-label="Draft description">
            {visibleDraft.description}
          </output>
          <button
            type="button"
            onClick={() =>
              setReportDraft({
                title: 'Signed-out title',
                description: 'Signed-out description',
              })
            }
          >
            Enter signed-out report
          </button>
        </div>
      )
    }

    setSession(null)
    render(
      <CaptureUploadProvider
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={0}
        open
      >
        <DraftProbe />
      </CaptureUploadProvider>
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Enter signed-out report' })
    )

    setSession('user-2')
    assert.equal(
      screen.getByLabelText('Draft title').textContent,
      'Signed-out title'
    )
    assert.equal(
      screen.getByLabelText('Draft description').textContent,
      'Signed-out description'
    )

    setSession('user-3')
    assert.equal(screen.getByLabelText('Draft title').textContent, '')
    assert.equal(screen.getByLabelText('Draft description').textContent, '')
  })

  it('hides an unsubmitted Save title when the account changes', async () => {
    renderModal()
    fireEvent.click(screen.getByText('Save'))
    const accountAPopover = await screen.findByLabelText('Save recording')
    fireEvent.input(
      within(accountAPopover).getByPlaceholderText('What did you record?'),
      { target: { value: 'Private account A save draft' } }
    )

    setSession('user-2')

    const accountBTitle = within(
      await screen.findByLabelText('Save recording')
    ).getByPlaceholderText('What did you record?')
    assert.equal((accountBTitle as HTMLInputElement).value, '')
    assert.equal(uploadEnqueueCount(), 0)
  })

  it(
    'hides an unknown report from another account and restores it for its owner',
    { timeout: 15_000 },
    async () => {
      let progressPolls = 0
      testState.fetchResponse = () =>
        resolve({
          items:
            testState.currentSession?.id === 'other-user'
              ? [{ id: 'other-project', name: 'Other account project' }]
              : [{ id: 'owner-project', name: 'Owner private project' }],
        })
      testState.progressResponse = () => {
        progressPolls++
        return resolve(null)
      }

      renderModal()
      await selectReportProject('Owner private project')
      enterReport('Private report title', 'Private report description')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(progressPolls, 5), { timeout: 15_000 })

      setSession('other-user')
      assert.ok(
        screen.getByText(
          'This upload belongs to another account. Sign in with the account that started it to review its status or retry it.'
        )
      )
      assert.equal(screen.queryByDisplayValue('Private report title'), null)
      assert.equal(
        screen.queryByDisplayValue('Private report description'),
        null
      )
      assert.equal(screen.queryByText('Owner private project'), null)
      assert.equal(
        screen.queryByRole('button', { name: 'Retry report anyway' }),
        null
      )
      const saveButton = screen.getByRole('button', {
        name: 'Save',
      }) as HTMLButtonElement
      assert.equal(saveButton.disabled, true)
      fireEvent.click(saveButton)
      assert.equal(screen.queryByLabelText('Save recording'), null)
      assert.equal(uploadEnqueueCount(), 1)

      setSession('session-1')
      assert.ok(screen.getByText(/This report may already be in your project/))
      testState.progressResponse = () => uploadProgress(true)
      const retry = await screen.findByRole('button', {
        name: 'Retry report anyway',
      })
      await waitFor(() =>
        assert.equal((retry as HTMLButtonElement).disabled, false)
      )
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        'Private report title'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'Private report description'
      )
      fireEvent.click(retry)
      await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
      const retryIntent = intents.filter(
        intent => intent.type === 'upload:enqueue'
      )[1]!
      assert.equal(retryIntent.payload.projectId, 'owner-project')
      assert.equal(retryIntent.payload.title, 'Private report title')
    }
  )
})
