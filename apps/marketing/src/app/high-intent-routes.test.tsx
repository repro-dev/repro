import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

async function renderRoute(t: any, pagePath: string) {
  t.mock.module('../components/MarketingShell.module.css', {
    defaultExport: {},
  })
  t.mock.module('../components/HighIntentRoutePage.module.css', {
    defaultExport: {},
  })

  const { default: Page, metadata } = await import(pagePath)

  render(React.createElement(Page))

  return metadata
}

describe('high-intent marketing routes', () => {
  it('renders the features route as a capture-to-fix workflow', async t => {
    const metadata = await renderRoute(t, './features/page')

    assert.equal(metadata.title, 'Features')
    assert.ok(
      screen.getByRole('heading', {
        level: 1,
        name: 'Capture-to-fix workflow',
      })
    )
    assert.ok(screen.getByText(/ambiguous bug report/i))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Record' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Replay' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Diagnose' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Hand off' }))
    assert.ok(screen.getByRole('link', { name: 'Get started free' }))
    assert.equal(screen.queryByText('Start free'), null)
  })

  it('renders the install extension route with setup and troubleshooting content', async t => {
    const metadata = await renderRoute(t, './install-extension/page')

    assert.equal(metadata.title, 'Install the browser extension')
    assert.ok(
      screen.getByRole('heading', {
        level: 1,
        name: 'Install the browser extension',
      })
    )
    assert.ok(screen.getByText(/supported browser/i))
    assert.ok(screen.getByRole('heading', { level: 2, name: 'Install' }))
    assert.ok(screen.getByRole('heading', { level: 2, name: 'First capture' }))
    assert.ok(screen.getByRole('heading', { level: 2, name: 'Next steps' }))
    assert.ok(
      screen.getByRole('heading', { level: 2, name: 'Troubleshooting' })
    )
    assert.ok(screen.getByRole('link', { name: 'Get started free' }))
    assert.equal(screen.queryByText('Start free'), null)
  })

  it('renders the pricing route with the three tiers and pricing guidance', async t => {
    const metadata = await renderRoute(t, './pricing/page')

    assert.equal(metadata.title, 'Pricing')
    assert.ok(screen.getByRole('heading', { level: 1, name: 'Pricing' }))
    assert.ok(screen.getByText('Free'))
    assert.ok(screen.getByText('Repro+'))
    assert.ok(screen.getByText('Repro++'))
    assert.ok(screen.getByText('$0/month'))
    assert.ok(screen.getByText('$19/user/month'))
    assert.ok(screen.getByText('$49/user/month'))
    assert.ok(
      screen.getByText(/AI usage details are not expressed as fixed quotas/i)
    )
    assert.ok(screen.getByRole('link', { name: 'Get started free' }))
    assert.equal(screen.queryByText('Start free'), null)
  })
})
