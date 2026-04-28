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
const { SiteLayout } = require('./SiteLayout')

globalThis.React = React

afterEach(cleanup)

function renderLayout() {
  return render(
    <SiteLayout>
      <div>Page content</div>
    </SiteLayout>
  )
}

describe('site layout', () => {
  it('renders the primary header navigation and cta', () => {
    renderLayout()

    const header = screen.getByRole('banner')
    const headerLinks = within(header)
    const logo = header.querySelector('.marketing-shell__logo')

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

  it('opens the mobile navigation from the hamburger button', () => {
    renderLayout()

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

  it('renders grouped footer links and social links', () => {
    renderLayout()

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.ok(footerLinks.getByText('Workflow'))
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.ok(footerLinks.getByRole('link', { name: 'GitHub' }))
    assert.ok(footerLinks.getByRole('link', { name: 'X' }))
  })

  it('keeps the skip link and main content container', () => {
    renderLayout()

    const main = screen.getByRole('main') as HTMLElement

    assert.ok(screen.getByRole('link', { name: /skip to main content/i }))
    assert.doesNotMatch(main.getAttribute('style') ?? '', /padding-left:/)
    assert.doesNotMatch(main.getAttribute('style') ?? '', /padding-top:/)
    assert.ok(screen.getByText('Page content'))
  })
})
