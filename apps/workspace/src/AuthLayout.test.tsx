import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthLayout } from './AuthLayout'

describe('AuthLayout', () => {
  it('renders the brand artwork shell around the outlet', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/account/login']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route index element={<div>Login outlet</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /data-testid="particle-artwork-root"/)
    assert.match(html, /Login outlet/)
  })
})
