import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { RefreshProgressBar } from './RefreshProgressBar'

afterEach(cleanup)

describe('RefreshProgressBar', () => {
  it('renders progressbar role with correct aria-label', () => {
    render(
      <RefreshProgressBar show complete={false} ariaLabel="Refreshing data" />
    )

    const bar = screen.getByRole('progressbar')
    assert.ok(bar)
    assert.equal(bar.getAttribute('aria-label'), 'Refreshing data')
  })

  it('sets aria-valuenow to 80 when not complete', () => {
    render(
      <RefreshProgressBar show complete={false} ariaLabel="Refreshing data" />
    )

    const bar = screen.getByRole('progressbar')
    assert.equal(bar.getAttribute('aria-valuenow'), '80')
  })

  it('sets aria-valuenow to 100 when complete', () => {
    render(<RefreshProgressBar show complete ariaLabel="Refreshing data" />)

    const bar = screen.getByRole('progressbar')
    assert.equal(bar.getAttribute('aria-valuenow'), '100')
  })

  it('sets aria-valuemin and aria-valuemax', () => {
    render(
      <RefreshProgressBar show complete={false} ariaLabel="Refreshing data" />
    )

    const bar = screen.getByRole('progressbar')
    assert.equal(bar.getAttribute('aria-valuemin'), '0')
    assert.equal(bar.getAttribute('aria-valuemax'), '100')
  })

  it('returns null when show is false', () => {
    const { container } = render(
      <RefreshProgressBar
        show={false}
        complete={false}
        ariaLabel="Refreshing data"
      />
    )

    assert.equal(screen.queryByRole('progressbar'), null)
    assert.equal(container.textContent, '')
  })
})
