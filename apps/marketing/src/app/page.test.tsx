import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

require('../../../../node_modules/.pnpm/node_modules/global-jsdom/commonjs/register.cjs')

const React = require('react')
const { cleanup, render, screen, within } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('marketing homepage route', () => {
  it('renders the homepage inside the marketing shell', async t => {
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

    const { default: HomePage } = await import('./page')
    const { SiteLayout } = await import('../components/SiteLayout')

    render(React.createElement(SiteLayout, null, HomePage()))

    assert.ok(
      screen.getByRole('heading', {
        name: 'Bug reporting that captures every detail',
      })
    )
    assert.ok(screen.getByText(/captures sessions so your team can reproduce/i))
    assert.equal(
      screen
        .getByRole('link', { name: 'Get started free' })
        .getAttribute('href'),
      'https://app.example.test'
    )
    assert.ok(screen.getByRole('link', { name: 'See how it works' }))
    assert.ok(screen.getByText('Session preview'))
    assert.ok(screen.getByText('Capture the full context'))
    assert.ok(screen.getByText('Share one reproducible link'))
    assert.ok(screen.getByText('Move from bug to fix faster'))

    const styleText = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .join('\n')

    assert.ok(
      !/min-width:\s*320px/.test(styleText),
      'homepage hero should not enforce a 320px minimum width on narrow viewports'
    )

    const socialProofQuote = screen
      .getAllByText(
        (_text: string, element: HTMLElement | SVGElement | null) =>
          element?.textContent?.includes(
            'Support, QA, and engineering can all work from the same session.'
          )
      )
      .find((element: HTMLElement | SVGElement) => element.tagName === 'P')

    assert.ok(socialProofQuote)
    assert.ok(screen.getByText('Faster triage'))

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.ok(footerLinks.getByText('Resources'))
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.ok(footerLinks.getByRole('link', { name: 'GitHub' }))
    assert.ok(footerLinks.getByRole('link', { name: 'X' }))
  })
})
