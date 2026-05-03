import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('FeaturesPage', () => {
  it('renders the capture-to-fix workflow with grounded AI language', async t => {
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

    const { default: FeaturesPage, metadata } = await import('./page')

    render(React.createElement(FeaturesPage))

    assert.equal(metadata.title, 'Features')
    assert.ok(
      screen.getByRole('heading', {
        name: 'See the fix path before the guesswork starts',
        level: 1,
      })
    )
    assert.ok(screen.getByText(/recorded evidence/i))
    assert.ok(screen.getByText(/replay inspection/i))
    assert.ok(screen.getByText(/grounded ai diagnosis/i))
    assert.ok(screen.getByText('Capture the bug. Let AI find the fix.'))
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
