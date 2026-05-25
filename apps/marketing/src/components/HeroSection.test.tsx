import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

const signupHref = 'https://app.repro.dev/account/register'

afterEach(cleanup)

describe('HeroSection', () => {
  it('renders the hero CTA and screenshot image', async t => {
    t.mock.module('./MarketingShell.module.css', {
      defaultExport: {},
    })
    t.mock.module('./HeroSection.module.css', {
      defaultExport: {},
    })

    const { HeroSection } = await import('./HeroSection')

    const { container } = render(React.createElement(HeroSection))

    const primaryCta = screen.getByRole('link', {
      name: 'Get started for free',
    })

    assert.equal(primaryCta.getAttribute('href'), signupHref)
    assert.ok(screen.getByRole('link', { name: 'See how it works' }))
    assert.equal(
      screen
        .getByRole('link', { name: 'See how it works' })
        .getAttribute('href'),
      '#how-it-works'
    )
    assert.ok(screen.getByText('Bug reports for coding agents'))
    assert.ok(screen.getByText('Record the bug. Let AI find the fix.'))
    assert.ok(
      screen.getByText(
        'Repro captures the clicks, errors, and network requests behind a bug so coding agents can fix it faster.'
      )
    )
    assert.ok(
      screen.getByAltText(
        'Repro session inspector showing a captured bug report with replay, logs, and request details'
      )
    )
    assert.equal(screen.queryByText('recorded evidence'), null)
    assert.equal(screen.queryByText('AI finds the cause'), null)
    assert.equal(screen.queryByText('capture'), null)
    assert.equal(screen.queryByText('analyze'), null)
    assert.equal(screen.queryByText('handoff'), null)
    assert.equal(screen.queryByText('Session'), null)
    assert.equal(screen.queryByText('Replay'), null)
    assert.equal(screen.queryByText('Brief'), null)
    assert.ok(container.querySelector('section'))
  })
})
