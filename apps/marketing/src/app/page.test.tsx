import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const { cleanup, render, screen, within } = require('@testing-library/react')

globalThis.React = React

const signupHref = 'https://app.repro.dev/account/register'
const loginHref = 'https://app.repro.dev/account/login'

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
    t.mock.module('../components/HighIntentRoutePage.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/HomePageContent.module.css', {
      defaultExport: {},
    })
    t.mock.module('../components/HeroSection.module.css', {
      defaultExport: {},
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
    assert.ok(screen.getByText('Bug reports for coding agents'))

    assert.ok(
      screen.getByText(
        /captures the clicks, errors, and network requests behind a bug/i
      )
    )
    assert.ok(
      screen.getByAltText(
        'Repro session inspector showing a captured bug report with replay, logs, and request details'
      )
    )
    assert.ok(
      screen
        .getAllByRole('link', { name: 'Get started for free' })
        .every((link: HTMLElement) => link.getAttribute('href') === signupHref)
    )
    assert.ok(
      screen
        .getAllByRole('link', { name: 'See how it works' })
        .some(
          (link: HTMLElement) => link.getAttribute('href') === '#how-it-works'
        )
    )
    assert.ok(
      screen.getByRole('heading', { level: 2, name: 'From repro to fix' })
    )
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Record' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Replay' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Find the cause' }))
    assert.ok(screen.getByRole('heading', { level: 3, name: 'Fix' }))
    assert.equal(document.querySelector('#features'), null)
    const howItWorks = document.querySelector('#how-it-works')
    const signup = document.querySelector('#signup')

    assert.ok(howItWorks)
    assert.ok(signup)
    assert.ok(
      ((howItWorks as Element).compareDocumentPosition(signup as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    )
    assert.equal(
      screen.queryByText('Record the bug before the evidence is lost.'),
      null
    )
    assert.equal(
      screen.queryByText('Give each bug a clear trail of evidence.'),
      null
    )
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

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.equal(footerLinks.queryByText('Workflow'), null)
    assert.ok(footerLinks.getByText('Legal'))
    assert.equal(footerLinks.queryByText('Company'), null)
    assert.equal(footerLinks.queryByRole('link', { name: 'About' }), null)
    assert.equal(footerLinks.queryByRole('link', { name: 'Contact' }), null)
    assert.equal(
      footerLinks.queryByRole('link', { name: 'Refund policy' }),
      null
    )
    assert.equal(
      footerLinks
        .getByRole('link', { name: 'How it works' })
        .getAttribute('href'),
      '/#how-it-works'
    )
    assert.equal(
      footerLinks.getByRole('link', { name: 'Log in' }).getAttribute('href'),
      loginHref
    )
    assert.equal(footerLinks.queryByRole('link', { name: 'GitHub' }), null)
    assert.equal(footerLinks.queryByRole('link', { name: 'X' }), null)
    assert.ok(footerLinks.getByText(/Repro Software Ltd/))
  })
})
