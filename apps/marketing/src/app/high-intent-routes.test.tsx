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
  it('renders the features route as an evidence-first workflow', async t => {
    const metadata = await renderRoute(t, './features/page')

    assert.equal(metadata.title, 'How it works')
    assert.ok(
      screen.getByRole('heading', {
        level: 1,
        name: 'How Repro records the evidence behind a bug',
      })
    )
    assert.ok(screen.getByText(/Record the reproduction once/i))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Record' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Replay' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Find the cause' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Fix' }))
    assert.ok(screen.getByText(/A replayable report keeps the evidence/i))
    assert.equal(screen.queryByText(/The route speaks to QA/i), null)
    assert.ok(screen.getByRole('link', { name: 'Get started for free' }))
    assert.equal(screen.queryByText('Start free'), null)
  })

  it('renders the install extension route without troubleshooting content', async t => {
    const metadata = await renderRoute(t, './install-extension/page')

    assert.equal(metadata.title, 'Install the browser extension')
    assert.ok(
      screen.getByRole('heading', {
        level: 1,
        name: 'Install the Repro browser extension',
      })
    )
    assert.ok(screen.getByText(/Repro works in supported desktop browsers/i))
    assert.ok(
      screen.getByRole('heading', {
        level: 2,
        name: 'Add Repro to your browser',
      })
    )
    assert.ok(
      screen.getByRole('heading', {
        level: 2,
        name: 'Record the bug before the evidence is lost',
      })
    )
    assert.ok(
      screen.getByRole('heading', {
        level: 2,
        name: 'Put the evidence to work',
      })
    )
    assert.equal(
      screen.queryByRole('heading', { level: 2, name: 'Troubleshooting' }),
      null
    )
    assert.equal(screen.queryByText('The browser is not supported'), null)
    assert.ok(screen.getByRole('link', { name: 'Get started for free' }))
    assert.equal(screen.queryByText('Start free'), null)
  })

  it('renders the pricing route with approved tiers and no buyer guidance', async t => {
    const metadata = await renderRoute(t, './pricing/page')

    assert.equal(metadata.title, 'Pricing')
    assert.ok(screen.getByRole('heading', { level: 1, name: 'Pricing' }))
    assert.ok(screen.getByText('Free'))
    assert.ok(screen.getByText('Growth'))
    assert.ok(screen.getByText('Scale'))
    assert.ok(screen.getByText('$0/month'))
    assert.ok(screen.getByText('$29/user/month'))
    assert.ok(screen.getByText('Contact us'))
    assert.ok(
      screen.getByText(
        'For teams using replayable bug reports to improve bug burn-down and product quality.'
      )
    )
    assert.ok(
      screen.getByText(
        'Includes SDK access, MCP server access, and $10/month AI usage credit per user.'
      )
    )
    assert.equal(
      screen.queryByText(/AI usage details are not expressed as fixed quotas/i),
      null
    )
    assert.equal(
      screen.queryByRole('heading', { level: 2, name: /buyer guidance/i }),
      null
    )
    assert.ok(screen.getByRole('link', { name: 'Get started for free' }))
    assert.equal(screen.queryByText('Start free'), null)
  })
})
