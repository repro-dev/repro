import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

mock.module('react-hook-form', {
  namedExports: {
    useForm: () => ({
      handleSubmit: (fn: Function) => (e: any) => {
        e?.preventDefault?.()
        fn({ title: 'Test', description: 'Desc' })
      },
      register: (name: string) => ({ name }),
      formState: { errors: {} },
    }),
  },
})

// Must require() after mock registration so the mock takes effect
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ManualUploadForm } =
  require('./ManualUploadForm') as typeof import('./ManualUploadForm')

describe('ManualUploadForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders form fields and submit button', () => {
    render(<ManualUploadForm onSubmit={() => undefined} isUploading={false} />)

    const titleField = screen.queryByPlaceholderText('What is the bug?')
    assert.ok(titleField, 'Title field should be rendered')

    const descField = screen.queryByPlaceholderText(
      'Is there anything else that would be useful to know?'
    )
    assert.ok(descField, 'Description field should be rendered')

    const submitButton = screen.queryByText('Create Bug Report')
    assert.ok(submitButton, 'Submit button should be rendered')
  })

  it('disables submit button when isUploading is true', () => {
    render(<ManualUploadForm onSubmit={() => undefined} isUploading={true} />)

    const submitButton = screen.getByText('Create Bug Report')
    assert.ok(submitButton.hasAttribute('disabled'))
  })

  it('shows sign-in copy and disables submit when upload is unavailable for anonymous users', () => {
    render(
      <ManualUploadForm
        onSubmit={() => undefined}
        isUploading={false}
        uploadAvailability={{
          available: false,
          reason:
            'Sign in to Repro to upload/report this recording. You can still review playback or download locally.',
        }}
      />
    )

    assert.ok(screen.getByText(/Sign in to Repro to upload\/report/))
    assert.ok(screen.getByText('Create Bug Report').hasAttribute('disabled'))
  })

  it('shows project copy and disables submit when upload has no workspace project', () => {
    render(
      <ManualUploadForm
        onSubmit={() => undefined}
        isUploading={false}
        uploadAvailability={{
          available: false,
          reason:
            'Choose or create a workspace project to upload/report this recording. You can still review playback or download locally.',
        }}
      />
    )

    assert.ok(screen.getByText(/workspace project to upload\/report/))
    assert.ok(screen.getByText('Create Bug Report').hasAttribute('disabled'))
  })
})
