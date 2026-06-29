import { render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { describePreset } from '~/recordingPrivacyCopy'
import { PrivacyIndicator } from './PrivacyIndicator'

describe('PrivacyIndicator', () => {
  it('renders correct label and summary for strict preset', () => {
    const override = {
      maskedSelectors: [
        '.repro-mask',
        'input',
        'textarea',
        'select',
        '[contenteditable]',
        'img',
      ],
      redaction: undefined,
      maskImages: true,
    }

    const { label, summary } = describePreset(override)
    render(<PrivacyIndicator override={override} />)

    assert.ok(screen.getByText(label))
    assert.ok(screen.getByText(summary))
  })

  it('renders correct label and summary for standard preset', () => {
    const override = {
      maskedSelectors: ['.repro-mask'],
      redaction: undefined,
      maskImages: false,
    }

    const { label, summary } = describePreset(override)
    render(<PrivacyIndicator override={override} />)

    assert.ok(screen.getByText(label))
    assert.ok(screen.getByText(summary))
  })

  it('renders correct label and summary for off preset', () => {
    const override = {
      maskedSelectors: [],
      redaction: {
        sensitiveFieldPatterns: [] as Array<RegExp>,
        sensitiveValuePatterns: [],
        sensitiveInputTypes: new Set<string>(),
      },
      maskImages: false,
    }

    const { label, summary } = describePreset(override)
    render(<PrivacyIndicator override={override} />)

    assert.ok(screen.getByText(label))
    assert.ok(screen.getByText(summary))
  })

  it('has role="status" on the outer element', () => {
    const override = {
      maskedSelectors: ['.repro-mask'],
      redaction: undefined,
      maskImages: false,
    }

    render(<PrivacyIndicator override={override} />)

    // The outer Block renders as a div with role="status"
    const statusEl = document.querySelector('[role="status"]')
    assert.ok(statusEl)
  })
})
