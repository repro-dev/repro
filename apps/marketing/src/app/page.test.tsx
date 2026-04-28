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
  it('renders the homepage inside the site layout', async t => {
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
    const headerRow = header.querySelector(
      '.marketing-shell__site-header-row'
    ) as HTMLElement | null
    const heroHeading = screen.getByRole('heading', {
      name: 'Capture the bug. Let AI find the fix.',
      level: 1,
    })
    const homeContent = document.querySelector('.marketing-shell__home-content')
    const proofStrip = document.querySelector('.marketing-shell__proof-strip')

    assert.equal(
      window.getComputedStyle(header).backgroundColor,
      'rgba(0, 0, 0, 0)'
    )
    assert.ok(headerRow)
    assert.ok(homeContent)
    assert.ok(heroHeading.classList.contains('marketing-shell__hero-title'))
    assert.ok(proofStrip?.classList.contains('marketing-shell__grid-12'))

    assert.ok(
      screen.getByText(
        /one recorded session gives the agent the evidence to diagnose/i
      )
    )
    assert.ok(
      screen
        .getAllByRole('link', { name: 'Start free' })
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
    assert.ok(screen.getByText('Let the agent find the fix.'))
    assert.ok(document.querySelector('#features'))
    assert.equal(screen.queryByText('Activation'), null)
    assert.equal(screen.queryByText('Trust'), null)
    assert.ok(
      screen.getByRole('heading', {
        name: 'Capture the bug. Let AI find the fix.',
        level: 2,
      })
    )
    assert.equal(metadata.title, 'Capture the bug. Let AI find the fix.')
    assert.ok(
      metadata.description?.includes(
        'AI can inspect the evidence, find the cause'
      )
    )

    assert.ok(screen.getAllByText('Replay notes').length >= 1)
    assert.ok(screen.getAllByText('Fix log').length >= 1)
    assert.equal(screen.queryByText('capture-analyze-handoff'), null)
    assert.equal(screen.queryByText('Session-Replay-Brief'), null)

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.ok(footerLinks.getByText('Workflow'))
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.ok(footerLinks.getByRole('link', { name: 'GitHub' }))
    assert.ok(footerLinks.getByRole('link', { name: 'X' }))
  })
})
