import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('PricingPage', () => {
  it('renders approved plan names, prices, and the AI usage note', async t => {
    t.mock.module('../../components/HighIntentMarketingPages.module.css', {
      defaultExport: {},
    })
    t.mock.module('../../components/MarketingShell.module.css', {
      defaultExport: {},
    })

    const createEnv = t.mock.fn(() => ({
      REPRO_APP_URL: 'https://app.example.test',
    }))

    t.mock.module('~/config/env', {
      namedExports: {
        createEnv,
        defaultEnv: {
          REPRO_APP_URL: 'https://app.example.test',
        },
      },
    })

    const { default: PricingPage, metadata } = await import('./page')

    render(React.createElement(PricingPage))

    assert.equal(metadata.title, 'Pricing')
    assert.ok(screen.getByText('Free'))
    assert.ok(screen.getByText('Repro+'))
    assert.ok(screen.getByText('Repro++'))
    assert.ok(screen.getByText('$19/user/month'))
    assert.ok(screen.getByText('$49/user/month'))
    assert.ok(
      screen.getByText(/ai diagnosis and agentic usage may be metered/i)
    )
    assert.equal(screen.queryByText(/^Pro$/i), null)
    assert.equal(screen.queryByText(/^Team$/i), null)
    assert.ok(
      screen
        .getAllByRole('link', { name: 'Get started free' })
        .some(
          (link: HTMLElement) =>
            link.getAttribute('href') === 'https://app.example.test'
        )
    )
  })
})
