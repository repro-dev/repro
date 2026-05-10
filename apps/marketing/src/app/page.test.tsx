import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen, within } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('marketing homepage route', () => {
  it('renders the homepage inside the site layout', async t => {
    t.mock.module('../components/SiteLayout.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/Header.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/Footer.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/MarketingShell.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/HomePageContent.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/HeroSection.module.css', {
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

    const { default: HomePage, metadata } = await import('./page')
    const { SiteLayout } = await import('../components/SiteLayout')

    render(React.createElement(SiteLayout, null, HomePage()))

    const header = screen.getByRole('banner')
    const logo = header.querySelector('svg') as SVGSVGElement | null
    const heroHeading = screen.getByRole('heading', {
      name: 'Record the bug. Let AI find the fix.',
      level: 1,
    })

    assert.equal(
      window.getComputedStyle(header).backgroundColor,
      'rgba(0, 0, 0, 0)'
    )
    assert.ok(logo)
    assert.equal(logo?.getAttribute('height'), '30')
    assert.ok(heroHeading)

    assert.ok(
      screen.getByText(
        /captures the clicks, errors, and network requests behind a bug/i
      )
    )
    assert.ok(
      screen
        .getAllByRole('link', { name: 'Get started for free' })
        .some(
          (link: HTMLElement) =>
            link.getAttribute('href') === 'https://app.example.test'
        )
    )
    assert.ok(
      screen
        .getAllByRole('link', { name: 'See how it works' })
        .some((link: HTMLElement) => link.getAttribute('href') === '#features')
    )
    assert.ok(screen.getByText('recorded evidence'))
    assert.ok(screen.getAllByText('AI finds the cause').length >= 1)
    assert.ok(
      screen.getByText('Record the full session before the issue disappears.')
    )
    assert.ok(screen.getByText('Give each bug a clear trail of evidence.'))
    assert.ok(document.querySelector('#features'))
    assert.equal(screen.queryByText('Activation'), null)
    assert.equal(screen.queryByText('Trust'), null)
    assert.ok(
      screen.getByRole('heading', {
        name: 'Record the bug. Let AI find the fix.',
        level: 2,
      })
    )
    assert.equal(metadata.title, 'Record the bug. Let AI find the fix.')
    assert.ok(
      metadata.description?.includes(
        'clicks, errors, and network requests so coding agents can fix problems faster'
      )
    )

    assert.equal(screen.queryByText('Replay notes'), null)
    assert.equal(screen.queryByText('Fix log'), null)
    assert.equal(screen.queryByText('capture-analyze-handoff'), null)
    assert.equal(screen.queryByText('Session-Replay-Brief'), null)

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.equal(footerLinks.queryByText('Workflow'), null)
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.ok(footerLinks.getByRole('link', { name: 'How it works' }))
    assert.ok(footerLinks.getByRole('link', { name: 'Log in' }))
    assert.equal(footerLinks.queryByRole('link', { name: 'GitHub' }), null)
    assert.equal(footerLinks.queryByRole('link', { name: 'X' }), null)
    assert.ok(footerLinks.getByText(/Repro Software Ltd/))
  })
})
