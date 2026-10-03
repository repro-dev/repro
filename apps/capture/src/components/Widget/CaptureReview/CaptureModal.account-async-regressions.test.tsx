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
import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import {
  enterReport,
  playback,
  resetCaptureModalTestState,
  restoreEnvironment,
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

function PrincipalSwitchResolver({
  children,
  onSwitch,
}: {
  children: React.ReactNode
  onSwitch(): void
}) {
  const principalId = useSyncExternalStore(
    listener => {
      sessionListeners.add(listener)
      return () => sessionListeners.delete(listener)
    },
    () => testState.currentSession?.id ?? null
  )
  const previousPrincipalId = useRef(principalId)

  useLayoutEffect(() => {
    if (previousPrincipalId.current === principalId) return
    previousPrincipalId.current = principalId
    // Resolve before descendant passive effects can cancel project creation.
    onSwitch()
  }, [onSwitch, principalId])

  return children
}

function setSession(id: string) {
  testState.currentSession = { id }
  act(() => [...sessionListeners].forEach(listener => listener()))
}

function makePendingProjectCreation(
  onSwitch: () => void,
  children: React.ReactNode
) {
  return (
    <PortalRootProvider>
      <CaptureUploadProvider
        open
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={60_000}
      >
        <PrincipalSwitchResolver onSwitch={onSwitch}>
          {children}
        </PrincipalSwitchResolver>
      </CaptureUploadProvider>
    </PortalRootProvider>
  )
}

describe(
  'CaptureModal async account regressions',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('discards report project creation after the principal changes', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {}
          })
        }
        return resolve({
          items:
            testState.currentSession?.id === 'account-b'
              ? [{ id: 'account-b-project', name: 'Account B project' }]
              : [{ id: 'account-a-project', name: 'Account A project' }],
        })
      }

      render(
        makePendingProjectCreation(
          () =>
            finishProject?.({
              id: 'stale-project',
              name: 'Account A private project',
            }),
          <CaptureReview
            onClose={() => {}}
            playback={playback}
            recordingMode={RecordingMode.Snapshot}
            selectedDuration={60_000}
            setSelectedDuration={() => {}}
            privacyOverrides={{ maskedSelectors: [], ignoredSelectors: [] }}
          />
        )
      )

      fireEvent.click(await screen.findByLabelText('Report project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Account A private project' },
      })
      enterReport('Account A private title', 'Account A private description')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      setSession('account-b')

      assert.equal(uploadEnqueueCount(), 0)
      const accountBProject = screen.getByRole('combobox', {
        name: 'Report project',
      })
      assert.ok(accountBProject.textContent?.includes('Select a project'))
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        ''
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        ''
      )
      fireEvent.click(accountBProject)
      assert.ok(await screen.findByText('Account B project'))
      assert.equal(screen.queryByText('Account A private project'), null)
    })

    it('discards Save Recording project creation after the principal changes', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {}
          })
        }
        return resolve({
          items:
            testState.currentSession?.id === 'account-b'
              ? [{ id: 'account-b-project', name: 'Account B project' }]
              : [{ id: 'account-a-project', name: 'Account A project' }],
        })
      }

      render(
        makePendingProjectCreation(
          () =>
            finishProject?.({
              id: 'stale-project',
              name: 'Account A private project',
            }),
          <SaveRecordingPopover isAuthed />
        )
      )

      fireEvent.click(screen.getByText('Save'))
      const popover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(popover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(within(popover).getByPlaceholderText('Project name'), {
        target: { value: 'Account A private project' },
      })
      fireEvent.input(
        within(popover).getByPlaceholderText('What did you record?'),
        {
          target: { value: 'Account A private title' },
        }
      )
      fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      setSession('account-b')

      assert.equal(uploadEnqueueCount(), 0)
      const accountBPopover = screen.getByLabelText('Save recording')
      const accountBProject = within(accountBPopover).getByRole('combobox', {
        name: 'Select project',
      })
      assert.ok(accountBProject.textContent?.includes('Select a project'))
      assert.equal(
        (
          within(accountBPopover).getByPlaceholderText(
            'What did you record?'
          ) as HTMLInputElement
        ).value,
        ''
      )
      fireEvent.click(accountBProject)
      assert.ok(await screen.findByText('Account B project'))
      assert.equal(screen.queryByText('Account A private project'), null)
    })

    it('ignores a report project-creation rejection after the principal changes', async () => {
      let rejectProject: ((error: Error) => void) | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future(rejectFuture => {
            rejectProject = error => rejectFuture(error)
            return () => {}
          })
        }
        return resolve({
          items:
            testState.currentSession?.id === 'account-b'
              ? [{ id: 'account-b-project', name: 'Account B project' }]
              : [{ id: 'account-a-project', name: 'Account A project' }],
        })
      }

      render(
        makePendingProjectCreation(
          () => rejectProject?.(new Error('Account A project failed')),
          <CaptureReview
            onClose={() => {}}
            playback={playback}
            recordingMode={RecordingMode.Snapshot}
            selectedDuration={60_000}
            setSelectedDuration={() => {}}
            privacyOverrides={{ maskedSelectors: [], ignoredSelectors: [] }}
          />
        )
      )

      fireEvent.click(await screen.findByLabelText('Report project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Account A private project' },
      })
      enterReport('Account A private title', 'Account A private description')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(typeof rejectProject, 'function'))

      setSession('account-b')

      assert.equal(uploadEnqueueCount(), 0)
      assert.equal(
        screen.queryByText('Failed to create project. Please try again.'),
        null
      )
      assert.ok(
        screen
          .getByRole('combobox', { name: 'Report project' })
          .textContent?.includes('Select a project')
      )
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        ''
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        ''
      )
      assert.equal(screen.queryByText('Account A private project'), null)
    })

    it('ignores a Save Recording project-creation rejection after the principal changes', async () => {
      let rejectProject: ((error: Error) => void) | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future(rejectFuture => {
            rejectProject = error => rejectFuture(error)
            return () => {}
          })
        }
        return resolve({
          items:
            testState.currentSession?.id === 'account-b'
              ? [{ id: 'account-b-project', name: 'Account B project' }]
              : [{ id: 'account-a-project', name: 'Account A project' }],
        })
      }

      render(
        makePendingProjectCreation(
          () => rejectProject?.(new Error('Account A project failed')),
          <SaveRecordingPopover isAuthed />
        )
      )

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
      await waitFor(() => assert.equal(typeof rejectProject, 'function'))

      setSession('account-b')

      assert.equal(uploadEnqueueCount(), 0)
      assert.equal(
        screen.queryByText('Failed to create project. Please try again.'),
        null
      )
      const accountBPopover = screen.getByLabelText('Save recording')
      assert.ok(
        within(accountBPopover)
          .getByRole('combobox', { name: 'Select project' })
          .textContent?.includes('Select a project')
      )
      assert.equal(
        (
          within(accountBPopover).getByPlaceholderText(
            'What did you record?'
          ) as HTMLInputElement
        ).value,
        ''
      )
      assert.equal(screen.queryByText('Account A private project'), null)
    })
  }
)
