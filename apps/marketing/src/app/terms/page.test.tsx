import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import TermsPage, { metadata } from './page'

describe('TermsPage', () => {
  afterEach(cleanup)

  it('exports untemplated metadata for the route title', () => {
    assert.equal(metadata.title, 'Terms of Service')
  })

  it('renders the terms route with summaries, policy links, and last-updated text', () => {
    render(React.createElement(TermsPage))

    assert.ok(screen.getByRole('region', { name: /terms of service/i }))

    const summaries = screen.getAllByText(/plain-language summary:/i)
    assert.ok(summaries.length >= 3)

    const privacyLink = screen.getByRole('link', { name: /privacy policy/i })
    assert.equal(privacyLink.getAttribute('href'), '/privacy')

    const refundLink = screen.getByRole('link', { name: /refund policy/i })
    assert.equal(refundLink.getAttribute('href'), '/refund-policy')

    assert.ok(screen.getByText(/last updated: april 15, 2026/i))
  })
})
