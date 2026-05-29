import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, before, describe, it, mock } from 'node:test'
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

let ManualUploadForm: React.FC<{
  onSubmit: (data: { title: string; description: string }) => void
  isUploading: boolean
}>

before(async () => {
  const mod = await import('./ManualUploadForm')
  ManualUploadForm = mod.ManualUploadForm
})

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
})
