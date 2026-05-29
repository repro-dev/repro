// eslint-disable-next-line @typescript-eslint/no-require-imports
const { describe, it, afterEach, mock } = require('node:test')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const assert = require('node:assert/strict')

// Mock react-hook-form before imports
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, screen, cleanup } = require('@testing-library/react')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ManualUploadForm } = require('./ManualUploadForm')

describe('ManualUploadForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders form fields and submit button', () => {
    render(
      React.createElement(ManualUploadForm, {
        onSubmit: () => undefined,
        isUploading: false,
      })
    )

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
    render(
      React.createElement(ManualUploadForm, {
        onSubmit: () => undefined,
        isUploading: true,
      })
    )

    const submitButton = screen.getByText('Create Bug Report')
    assert.ok(submitButton.hasAttribute('disabled'))
  })
})
