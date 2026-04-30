import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

require('../../../../node_modules/.pnpm/node_modules/global-jsdom/commonjs/register.cjs')

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('HeroSection', () => {
  it('renders the hero CTA and replay evidence content', async t => {
    t.mock.module('./MarketingShell.module.css', {
      defaultExport: {},
    })
    t.mock.module('./HeroSection.module.css', {
      defaultExport: {},
    })

    const { HeroSection } = await import('./HeroSection')

    const { container } = render(
      React.createElement(HeroSection, { appUrl: 'https://app.repro.test' })
    )

    const primaryCta = screen.getByRole('link', { name: 'Start free' })

    assert.equal(primaryCta.getAttribute('href'), 'https://app.repro.test')
    assert.ok(screen.getByRole('link', { name: 'See how it works' }))
    assert.ok(screen.getByText('Capture / AI / find / fix'))
    assert.ok(screen.getByText('Capture the bug. Let AI find the fix.'))
    assert.ok(screen.getByText('recorded evidence'))
    assert.ok(screen.getAllByText('AI finds the cause').length >= 1)
    assert.ok(screen.getByText('capture'))
    assert.ok(screen.getByText('analyze'))
    assert.ok(screen.getByText('handoff'))
    assert.ok(screen.getByText('Session'))
    assert.ok(screen.getByText('Replay'))
    assert.ok(screen.getByText('Brief'))
    assert.equal(screen.queryByText('capture-analyze-handoff'), null)
    assert.equal(screen.queryByText('Session-Replay-Brief'), null)
    assert.ok(container.querySelector('section'))
  })
})
