import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

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
const assert = require('node:assert/strict')

globalThis.React = React

afterEach(cleanup)

function renderLayout() {
  return render(
    <SiteLayout>
      <div>Page content</div>
    </SiteLayout>
  )
}

describe('marketing shell', () => {
  it('renders the primary header navigation and cta', () => {
    renderLayout()

    const header = screen.getByRole('banner')
    const headerLinks = within(header)

    assert.ok(headerLinks.getByRole('link', { name: /repro home/i }))
    assert.ok(headerLinks.getByRole('link', { name: 'Features' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Pricing' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Install Extension' }))
    assert.ok(headerLinks.getByRole('link', { name: 'Blog' }))
    assert.ok(headerLinks.getByRole('link', { name: /get started/i }))
  })

  it('opens the mobile navigation from the hamburger button', async () => {
    renderLayout()

    const header = screen.getByRole('banner')
    const headerButtons = within(header)

    assert.ok(headerButtons.getByRole('button', { name: /menu/i }))

    fireEvent.click(headerButtons.getByRole('button', { name: /menu/i }))

    assert.ok(screen.getByRole('dialog'))
    assert.ok(screen.getAllByRole('link', { name: 'Features' }).length > 1)
  })

  it('renders grouped footer links and social links', () => {
    renderLayout()

    const footer = screen.getByRole('contentinfo')
    const footerLinks = within(footer)

    assert.ok(footerLinks.getByText('Product'))
    assert.ok(footerLinks.getByText('Resources'))
    assert.ok(footerLinks.getByText('Company'))
    assert.ok(footerLinks.getByText('Legal'))
    assert.ok(footerLinks.getByRole('link', { name: 'GitHub' }))
    assert.ok(footerLinks.getByRole('link', { name: 'X' }))
  })

  it('keeps the skip link and main content container', () => {
    renderLayout()

    assert.ok(screen.getByRole('link', { name: /skip to main content/i }))
    assert.ok(screen.getByRole('main'))
    assert.ok(window.getComputedStyle(screen.getByRole('main')).maxWidth)
    assert.ok(screen.getByText('Page content'))
  })
})
