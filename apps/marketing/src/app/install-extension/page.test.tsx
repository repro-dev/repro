import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('InstallExtensionPage', () => {
  it('renders browser support, setup, first capture, and troubleshooting guidance', async t => {
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

    const { default: InstallExtensionPage, metadata } = await import('./page')

    render(React.createElement(InstallExtensionPage))

    assert.equal(metadata.title, 'Install the extension')
    assert.ok(
      screen.getByText(/chrome, edge, and other chromium-based browsers/i)
    )
    assert.ok(screen.getByText(/pin the extension and sign in/i))
    assert.ok(screen.getByText(/start the session, reproduce the bug/i))
    assert.ok(screen.getByText(/permissions and refresh/i))
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
