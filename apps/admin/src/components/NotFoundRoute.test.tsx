import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NotFoundRoute } from './NotFoundRoute'

afterEach(cleanup)

describe('NotFoundRoute', () => {
  it('renders the not-found heading, description, and a link home', () => {
    render(
      <MemoryRouter initialEntries={['/definitely-not-a-route']}>
        <Routes>
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </MemoryRouter>
    )

    assert.ok(screen.getByText('Page not found'))
    assert.ok(
      screen.getByText(
        "The page you're looking for doesn't exist or may have moved."
      )
    )

    const homeLink = screen.getByText('Back to home')
    assert.equal(homeLink.getAttribute('href'), '/')
  })

  it('renders no other route content for the unmatched path', () => {
    render(
      <MemoryRouter initialEntries={['/definitely-not-a-route']}>
        <Routes>
          <Route path="/health" element={<div>health route</div>} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </MemoryRouter>
    )

    assert.equal(screen.queryByText('health route'), null)
    assert.ok(screen.getByText('Page not found'))
  })
})
