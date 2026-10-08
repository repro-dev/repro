import { PortalRootProvider } from '@repro/design'
import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { PrivacySection } from './PrivacySection'

describe('PrivacySection disclosure', () => {
  afterEach(() => {
    cleanup()
  })

  it('limits selector scope and discloses unchanged HTTP body formats', () => {
    render(
      <PortalRootProvider>
        <PrivacySection
          open={true}
          onOpenChange={mock.fn()}
          onOverridesChange={mock.fn()}
        />
      </PortalRootProvider>
    )

    const disclosure = screen.getByText(
      /These controls mask or omit page elements that match your selectors/
    )
    assert.match(
      disclosure.textContent ?? '',
      /Scalar JSON, non-JSON text, and binary HTTP bodies may be recorded unchanged\./
    )
    assert.equal(
      screen.queryByText(/prevent sensitive data from being leaked/i),
      null,
      'Privacy copy should not make a blanket leak-prevention claim'
    )
  })
})
