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
  intents,
  playback,
  renderModal,
  requests,
  resetCaptureModalTestState,
  restoreEnvironment,
  sessionListeners,
  testState,
  uploadEnqueueCount,
  uploadProgress,
} from './CaptureModal.test-utils'

function setSession(id: string | null) {
  testState.currentSession = id === null ? null : { id }
  act(() => [...sessionListeners].forEach(listener => listener()))
}

describe(
  'CaptureModal Save Recording account privacy',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('hides a completed Save title from another account without changing the owner title', async () => {
      renderModal()
      fireEvent.click(screen.getByText('Save'))
      const accountAPopover = await screen.findByLabelText('Save recording')
      fireEvent.click(
        await within(accountAPopover).findByLabelText('Select project')
      )
      const projects = await screen.findAllByText('MVP Pilot')
      fireEvent.click(projects[projects.length - 1]!)
      fireEvent.input(
        within(accountAPopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Account A completed title' } }
      )
      fireEvent.click(
        within(accountAPopover).getByRole('button', { name: 'Save' })
      )
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      await screen.findByRole('button', { name: 'Open in Repro' })

      setSession('user-2')
      const toolbarSave = screen
        .getAllByRole('button', { name: /^Save$/ })
        .find(
          button => button.closest('[aria-label="Save recording"]') === null
        )
      assert.ok(toolbarSave)
      fireEvent.click(toolbarSave)
      const accountBPopover = await screen.findByLabelText('Save recording')
      const accountBTitle = within(accountBPopover).getByPlaceholderText(
        'What did you record?'
      ) as HTMLInputElement
      assert.equal(accountBTitle.value, '')

      fireEvent.input(accountBTitle, {
        target: { value: 'Account B new title' },
      })
      setSession('session-1')

      const ownerTitle = within(
        await screen.findByLabelText('Save recording')
      ).getByPlaceholderText('What did you record?') as HTMLInputElement
      assert.equal(ownerTitle.value, 'Account A completed title')
      assert.equal(uploadEnqueueCount(), 1)
    })

    it(
      'hides Save Recording projects on account switch and clears its draft on logout',
      { timeout: 5_000 },
      async () => {
        const createdNames: string[] = []
        testState.fetchResponse = (path, options) => {
          if (path === '/projects' && options?.method === 'POST') {
            createdNames.push(JSON.parse(options.body ?? '{}').name)
            return resolve({ id: 'created-project', name: 'Private draft' })
          }
          if (testState.currentSession?.id === 'user-2') {
            return Future(() => () => {})
          }
          if (testState.currentSession?.id === 'user-3') {
            return resolve({
              items: [
                { id: 'user-3-project', name: 'Current account project' },
              ],
            })
          }
          return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
        }

        renderModal()
        fireEvent.click(screen.getByText('Save'))
        const popover = await screen.findByLabelText('Save recording')
        const select = await within(popover).findByLabelText('Select project')
        fireEvent.click(select)
        const options = await screen.findAllByText('MVP Pilot')
        fireEvent.click(options[options.length - 1]!)
        fireEvent.input(
          within(popover).getByPlaceholderText('What did you record?'),
          { target: { value: 'Saved recording' } }
        )

        setSession('user-2')
        assert.equal(screen.queryByText('MVP Pilot'), null)
        const save = within(popover).getByRole('button', {
          name: 'Save',
        }) as HTMLButtonElement
        assert.equal(save.disabled, true)
        fireEvent.click(save)
        assert.equal(uploadEnqueueCount(), 0)

        setSession('user-3')
        await waitFor(() =>
          assert.equal(within(popover).queryByText('Loading projects…'), null)
        )
        const currentSelect = within(popover).getByLabelText('Select project')
        fireEvent.click(currentSelect)
        assert.ok(await screen.findByText('Current account project'))
        fireEvent.click(screen.getByText('Create new project…'))
        fireEvent.input(screen.getByPlaceholderText('Project name'), {
          target: { value: 'Private draft' },
        })
        setSession(null)

        assert.equal(screen.queryAllByText('Current account project').length, 0)
        assert.equal(screen.queryByDisplayValue('Private draft'), null)
        assert.equal(save.disabled, true)
        fireEvent.click(save)
        assert.deepEqual(createdNames, [])
        assert.equal(uploadEnqueueCount(), 0)
        assert.equal(
          requests.some(request => request.options?.method === 'POST'),
          false
        )
      }
    )

    it(
      'hides an unknown Save Recording title from another account and restores it to its owner',
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
        fireEvent.click(screen.getByText('Save'))
        const popover = await screen.findByLabelText('Save recording')
        fireEvent.click(await within(popover).findByLabelText('Select project'))
        fireEvent.click(await screen.findByText('Owner private project'))
        fireEvent.input(
          within(popover).getByPlaceholderText('What did you record?'),
          { target: { value: 'Private saved title' } }
        )
        fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))
        await waitFor(() => assert.equal(progressPolls, 5), { timeout: 15_000 })

        setSession('other-user')
        assert.ok(
          screen.getByText(
            'This upload belongs to another account. Sign in with the account that started it to review its status or retry it.'
          )
        )
        assert.equal(screen.queryByLabelText('Save recording'), null)
        assert.equal(screen.queryByDisplayValue('Private saved title'), null)
        assert.equal(
          screen.queryByRole('button', { name: 'Retry save anyway' }),
          null
        )
        assert.equal(uploadEnqueueCount(), 1)

        setSession('session-1')
        const ownerPopover = await screen.findByLabelText('Save recording')
        assert.ok(within(ownerPopover).getByText(/The recording may already/))
        assert.equal(
          (
            within(ownerPopover).getByPlaceholderText(
              'What did you record?'
            ) as HTMLInputElement
          ).value,
          'Private saved title'
        )
        testState.progressResponse = () => uploadProgress(true)
        const retry = within(ownerPopover).getByRole('button', {
          name: 'Retry save anyway',
        })
        await waitFor(() =>
          assert.equal((retry as HTMLButtonElement).disabled, false)
        )
        fireEvent.click(retry)
        await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
        const retryIntent = intents.filter(
          intent => intent.type === 'upload:enqueue'
        )[1]!
        assert.equal(retryIntent.payload.projectId, 'owner-project')
        assert.equal(retryIntent.payload.title, 'Private saved title')
      }
    )

    it('rejects a stale unknown retry callback after an account switch', async () => {
      const { CaptureUploadProvider, useCaptureUpload } = await import(
        './CaptureUploadProvider'
      )
      let staleEnqueue:
        | ((
            projectId: string,
            title: string,
            description: string | null,
            source?: 'report' | 'save-recording'
          ) => void)
        | null = null
      let progressPolls = 0
      testState.progressResponse = () => {
        progressPolls++
        return resolve(null)
      }
      const UploadProbe = () => {
        const { enqueueUpload } = useCaptureUpload()
        staleEnqueue ??= enqueueUpload
        return (
          <button
            onClick={() =>
              enqueueUpload(
                'owner-project',
                'Private report',
                'Details',
                'report'
              )
            }
          >
            Start upload
          </button>
        )
      }

      render(
        <CaptureUploadProvider
          open
          playback={playback}
          recordingMode={RecordingMode.Snapshot}
          selectedDuration={60_000}
        >
          <UploadProbe />
        </CaptureUploadProvider>
      )
      fireEvent.click(screen.getByRole('button', { name: 'Start upload' }))
      await waitFor(() => assert.equal(progressPolls, 5), { timeout: 15_000 })

      act(() =>
        staleEnqueue!('owner-project', 'Private save', null, 'save-recording')
      )
      assert.equal(uploadEnqueueCount(), 1)

      setSession('other-user')
      act(() =>
        staleEnqueue!('owner-project', 'Private report', 'Details', 'report')
      )
      assert.equal(uploadEnqueueCount(), 1)
    })
  }
)
