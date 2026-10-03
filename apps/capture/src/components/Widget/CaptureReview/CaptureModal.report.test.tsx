import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react'
import { Future, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import {
  enterReport,
  intents,
  renderModal,
  requests,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

describe('CaptureModal report flow', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  after(restoreEnvironment)

  it('submits the report with its project and captured recording, then opens the saved recording', async () => {
    let openedUrl: string | undefined
    const originalOpen = window.open
    window.open = ((url?: string | URL) => {
      openedUrl = String(url)
      return null
    }) as typeof window.open

    try {
      renderModal()
      await selectReportProject('MVP Pilot')
      enterReport('Checkout is broken', 'The submit action never completes.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      await waitFor(() => {
        const upload = intents.find(intent => intent.type === 'upload:enqueue')
        assert.ok(upload)
        assert.equal(upload.payload.projectId, 'project-1')
        assert.equal(upload.payload.title, 'Checkout is broken')
        assert.equal(
          upload.payload.description,
          'The submit action never completes.'
        )
        assert.equal((upload.payload.events as string[]).length, 1)
        assert.equal(upload.payload.duration, 60_000)
      })

      assert.equal(screen.queryByText(/agentic debugging/i), null)
      assert.equal(
        requests.some(request => request.path === '/agentic/response'),
        false
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Open in Repro' })
      )
      assert.equal(
        openedUrl,
        'https://app.repro.test/projects/project-1/recordings/recording-1'
      )
    } finally {
      window.open = originalOpen
    }
  })

  it('creates the selected destination project before enqueueing the report', async () => {
    const createdProjects: Array<{ path: string; body?: string }> = []
    testState.fetchResponse = (path, options) => {
      if (options?.method === 'POST') {
        createdProjects.push({ path, body: options.body })
        return resolve({ id: 'created-project', name: 'New pilot' })
      }
      return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
    }

    renderModal()
    fireEvent.click(await screen.findByLabelText('Report project'))
    fireEvent.click(await screen.findByText('Create new project…'))
    fireEvent.input(await screen.findByPlaceholderText('Project name'), {
      target: { value: 'New pilot' },
    })
    enterReport('Broken search', 'Search returns no results.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

    await waitFor(() => {
      assert.deepEqual(createdProjects, [
        { path: '/projects', body: JSON.stringify({ name: 'New pilot' }) },
      ])
      const upload = intents.find(intent => intent.type === 'upload:enqueue')
      assert.ok(upload)
      assert.equal(upload.payload.projectId, 'created-project')
      assert.equal(upload.payload.title, 'Broken search')
      assert.equal(upload.payload.description, 'Search returns no results.')
    })

    const submit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement
    await waitFor(() => assert.equal(submit.disabled, false))
    enterReport('Another report', 'The selected new project stays available.')
    fireEvent.click(submit)
    await waitFor(() => {
      assert.equal(uploadEnqueueCount(), 2)
      const uploads = intents.filter(intent => intent.type === 'upload:enqueue')
      assert.equal(uploads[1]?.payload.projectId, 'created-project')
    })
  })

  it('keeps report details visible and prompts signed-out users without uploading', async () => {
    testState.currentSession = null
    let openedUrl: string | undefined
    const originalOpen = window.open
    const originalVisibilityState = Object.getOwnPropertyDescriptor(
      document,
      'visibilityState'
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    window.open = ((url?: string | URL) => {
      openedUrl = String(url)
      return null
    }) as typeof window.open

    try {
      renderModal()
      enterReport('Lost draft', 'Keep this report after sign-in.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      assert.ok(
        await screen.findByText(/Your report details will stay in place/)
      )
      assert.equal(
        document.activeElement,
        screen.getByRole('button', { name: 'Sign in' })
      )
      assert.equal(
        (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
          .value,
        'Lost draft'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'Keep this report after sign-in.'
      )
      assert.equal(uploadEnqueueCount(), 0)
      assert.equal(
        requests.some(request => request.options?.method === 'POST'),
        false
      )

      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      assert.equal(openedUrl, 'https://app.repro.test/account/login')
      fireEvent(document, new window.Event('visibilitychange'))
      await waitFor(() => assert.equal(testState.loadSessionCalls, 1))
      await selectReportProject('MVP Pilot')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      await waitFor(() => {
        const upload = intents.find(intent => intent.type === 'upload:enqueue')
        assert.ok(upload)
        assert.equal(upload.payload.projectId, 'project-1')
        assert.equal(upload.payload.title, 'Lost draft')
        assert.equal(
          upload.payload.description,
          'Keep this report after sign-in.'
        )
      })
    } finally {
      window.open = originalOpen
      if (originalVisibilityState) {
        Object.defineProperty(
          document,
          'visibilityState',
          originalVisibilityState
        )
      } else {
        delete (document as { visibilityState?: DocumentVisibilityState })
          .visibilityState
      }
    }
  })

  it('does not treat a session-loading state as signed out', () => {
    testState.currentSession = null
    testState.sessionLoading = true
    renderModal()

    assert.ok(screen.getByRole('textbox', { name: 'Title' }))
    assert.equal(screen.queryByRole('button', { name: 'Sign in' }), null)
    assert.equal(
      (
        screen.getByRole('button', {
          name: 'Create Bug Report',
        }) as HTMLButtonElement
      ).disabled,
      true
    )
  })

  it('keeps report and title-only save project selections independent', async () => {
    renderModal()
    await selectReportProject('MVP Pilot')
    fireEvent.click(screen.getByText('Save'))
    assert.equal(
      (await screen.findByLabelText('Select project')).textContent,
      'Select a project…'
    )
  })

  it('shows enqueue failure, preserves report details, and allows retry', async () => {
    testState.enqueueResponse = () => reject(new Error('enqueue failed'))
    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Keep this title', 'Keep this description.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

    assert.ok(
      await screen.findByText(
        'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
      )
    )
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .value,
      'Keep this title'
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).value,
      'Keep this description.'
    )
    assert.equal(
      (
        screen.getByRole('button', {
          name: 'Retry report',
        }) as HTMLButtonElement
      ).disabled,
      false
    )

    testState.enqueueResponse = () => resolve('upload-ref-1')
    fireEvent.click(screen.getByRole('button', { name: 'Retry report' }))
    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
  })

  it('locks report submission until a delayed enqueue acknowledgement fails', async () => {
    let rejectEnqueue: ((error: Error) => void) | null = null
    testState.enqueueResponse = () =>
      Future(reject => {
        rejectEnqueue = reject
        return () => {}
      })

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Delayed report', 'Do not enqueue this twice.')
    const submit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement

    fireEvent.click(submit)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
    assert.equal(submit.disabled, true)
    fireEvent.click(submit)
    assert.equal(uploadEnqueueCount(), 1)

    assert.ok(rejectEnqueue)
    act(() => rejectEnqueue!(new Error('enqueue failed')))
    assert.ok(
      await screen.findByText(
        'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
      )
    )
    await waitFor(() => assert.equal(submit.disabled, false))
    assert.equal(uploadEnqueueCount(), 1)
  })
})
