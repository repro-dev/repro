import { getElementCSSRules } from '@repro/testing-utils'
import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { textStyles } from '../tokens/typography'
import { EmptyStateTitle } from './EmptyStateTitle'

afterEach(cleanup)

describe('EmptyStateTitle', () => {
  // Heading levels must not skip: pages whose PageFrame.Title renders an <h1>
  // compose the empty state directly under it and need an <h2> (REP-1656
  // skipped-heading finding on PageListEmpty). Default stays <h3> for
  // standalone EmptyState usage under an <h2> page heading.
  it('renders an h3 by default', () => {
    render(<EmptyStateTitle>No sessions yet</EmptyStateTitle>)
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      'No sessions yet'
    )
  })

  it('renders an h2 when headingLevel="h2"', () => {
    render(<EmptyStateTitle headingLevel="h2">No sessions yet</EmptyStateTitle>)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'No sessions yet'
    )
  })

  it('keeps the heading3 text style regardless of level', () => {
    const { container } = render(
      <EmptyStateTitle headingLevel="h2">No sessions yet</EmptyStateTitle>
    )
    const css = getElementCSSRules(container.querySelector('h2')!)
      .map(({ cssText }) => cssText)
      .join('\n')
    expect(css).toContain(`font-size: ${textStyles.heading3.fontSize}px`)
  })
})
