import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

require('../../../../node_modules/.pnpm/node_modules/global-jsdom/commonjs/register.cjs')

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')
const { hydrateRoot } = require('react-dom/client')
const { renderToString } = require('react-dom/server')

globalThis.React = React

afterEach(cleanup)

describe('HeroSection', () => {
  it('renders the hero CTA and demo content', async () => {
    const { HeroSection } = await import('./HeroSection')

    render(
      React.createElement(HeroSection, { appUrl: 'https://app.repro.test' })
    )

    const primaryCta = screen.getByRole('link', { name: 'Get started free' })

    assert.equal(primaryCta.getAttribute('href'), 'https://app.repro.test')
    assert.ok(screen.getByRole('link', { name: 'See how it works' }))
    assert.ok(screen.getByText('Session preview'))
    assert.ok(screen.getByText('Capture bugs with context'))
    assert.ok(screen.getByText('Captured in'))
  })
})

describe('HomePage', () => {
  it('hydrates the home page route without changing the CTA href', async t => {
    t.mock.module('next/navigation', {
      namedExports: {
        useServerInsertedHTML() {},
      },
    })

    const { JsxstyleRegistry } = await import('../app/JsxstyleRegistry')
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

    const { default: HomePage } = await import('../app/page')
    const element = <JsxstyleRegistry>{HomePage()}</JsxstyleRegistry>
    const markup = renderToString(element)
    const consoleError = t.mock.method(console, 'error', () => {})

    const container = document.createElement('div')
    container.innerHTML = markup

    const root = hydrateRoot(container, element)

    await new Promise(resolve => setTimeout(resolve, 0))

    const primaryCta = container.querySelector(
      'a[href="https://app.example.test"]'
    )

    assert.equal(createEnv.mock.calls.length, 1)
    assert.ok(primaryCta)
    assert.equal(consoleError.mock.calls.length, 0)

    root.unmount()
  })
})
