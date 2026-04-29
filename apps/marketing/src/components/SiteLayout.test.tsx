import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

require('../../../../node_modules/.pnpm/node_modules/global-jsdom/commonjs/register.cjs')

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
    assert.ok(headerLinks.getByRole('link', { name: 'Features' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Pricing' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Sign up' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Start free' }))
  })

  it('opens the mobile navigation from the hamburger button', async t => {
    await renderLayout(t)

    const header = screen.getByRole('banner')
    const headerButtons = within(header)

    assert.ok(headerButtons.getByRole('button', { name: /menu/i }))

    fireEvent.click(headerButtons.getByRole('button', { name: /menu/i }))

    assert.ok(screen.getByRole('dialog'))

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'Sign up' })
    )

    assert.equal(screen.queryByRole('dialog'), null)
  })

  it('renders grouped footer links and social links', async t => {
    await renderLayout(t)

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.ok(footerLinks.getByText('Workflow'))
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.ok(footerLinks.getByRole('link', { name: 'GitHub' }))
    assert.ok(footerLinks.getByRole('link', { name: 'X' }))
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
