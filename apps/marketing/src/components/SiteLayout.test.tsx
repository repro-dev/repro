import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const React = require('react')
const {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

async function renderLayout(t: any) {
  t.mock.module('./SiteLayout.module.css', {
    defaultExport: {},
  })
  t.mock.module('./Header.module.css', {
    defaultExport: {},
  })
  t.mock.module('./Footer.module.css', {
    defaultExport: {},
  })
  t.mock.module('./MarketingShell.module.css', {
    defaultExport: {},
  })

  const { SiteLayout } = await import('./SiteLayout')

  return render(
    <SiteLayout>
      <div>Page content</div>
    </SiteLayout>
  )
}

describe('site layout', () => {
  it('renders the primary header navigation and cta', async t => {
    await renderLayout(t)

    const header = screen.getByRole('banner')
    const headerLinks = within(header)
    const logo = header.querySelector('svg')

    assert.equal(
      window.getComputedStyle(header).backgroundColor,
      'rgba(0, 0, 0, 0)'
    )
    assert.ok(logo)
    assert.equal(logo?.getAttribute('height'), '30')

    assert.ok(headerLinks.getByRole('link', { name: /repro home/i }))
    assert.ok(headerLinks.getByRole('link', { name: 'How it works' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Pricing' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Log in' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Get started for free' }))
  })

  it('opens the mobile navigation from the hamburger button', async t => {
    await renderLayout(t)

    const header = screen.getByRole('banner')
    const headerButtons = within(header)

    assert.ok(headerButtons.getByRole('button', { name: /menu/i }))

    fireEvent.click(headerButtons.getByRole('button', { name: /menu/i }))

    assert.ok(screen.getByRole('dialog'))

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'Log in' })
    )

    assert.equal(screen.queryByRole('dialog'), null)
  })

  it('renders grouped footer links without social links', async t => {
    await renderLayout(t)

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.equal(footerLinks.queryByText('Workflow'), null)
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.equal(footerLinks.queryByRole('link', { name: 'GitHub' }), null)
    assert.equal(footerLinks.queryByRole('link', { name: 'X' }), null)
    assert.ok(footerLinks.getByText(/Repro Software Ltd/))
  })

  it('keeps the skip link and main content container', async t => {
    await renderLayout(t)

    const main = screen.getByRole('main') as HTMLElement

    assert.ok(screen.getByRole('link', { name: /skip to main content/i }))
    assert.doesNotMatch(main.getAttribute('style') ?? '', /padding-left:/)
    assert.doesNotMatch(main.getAttribute('style') ?? '', /padding-top:/)
    assert.ok(screen.getByText('Page content'))
  })
})
