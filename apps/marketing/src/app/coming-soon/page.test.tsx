import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('coming soon route', () => {
  it('renders the launch placeholder and home link', async t => {
    t.mock.module('~/components/HighIntentRoutePage.module.css', {
      defaultExport: {},
    })
    t.mock.module('~/components/MarketingShell.module.css', {
      defaultExport: {},
    })

    const { default: ComingSoonPage, metadata } = await import('./page')

    render(React.createElement(ComingSoonPage))

    assert.equal(metadata.title, 'Coming soon')
    assert.ok(
      screen.getByRole('heading', {
        level: 1,
        name: 'Coming soon',
      })
    )
    assert.ok(screen.getByText(/Repro is getting ready for launch/i))
    assert.equal(
      screen
        .getByRole('link', { name: 'See how it works' })
        .getAttribute('href'),
      '/#how-it-works'
    )
  })
})
