import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

globalThis.React = React

afterEach(cleanup)

describe('TermsPage', () => {
  it('exports untemplated metadata for the route title', async t => {
    t.mock.module('../components/LegalPageShell.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/MarketingShell.module.css', {
      defaultExport: {},
    })

    const { metadata } = await import('./page')

    assert.equal(metadata.title, 'Terms of Service')
  })

  it('renders the terms route with summaries, policy links, and last-updated text', async t => {
    t.mock.module('../components/LegalPageShell.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/MarketingShell.module.css', {
      defaultExport: {},
    })

    const { default: TermsPage } = await import('./page')

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
