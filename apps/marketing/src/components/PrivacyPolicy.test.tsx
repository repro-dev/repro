import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrivacyPolicy } from './PrivacyPolicy'

// renderToStaticMarkup runs in Node.js without a DOM — safe for server-side
// component testing where @testing-library/react (jsdom) is not configured.

describe('PrivacyPolicy', () => {
  it('renders the page title', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Privacy Policy'),
      'Expected "Privacy Policy" heading'
    )
  })

  it('renders the Information We Collect section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Information We Collect'),
      'Expected "Information We Collect" section heading'
    )
  })

  it('renders the How We Use Information section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('How We Use Information'),
      'Expected "How We Use Information" section heading'
    )
  })

  it('renders the Data Sharing section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Data Sharing'),
      'Expected "Data Sharing" section heading'
    )
  })

  it('renders the Data Retention section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Data Retention'),
      'Expected "Data Retention" section heading'
    )
  })

  it('renders the Your Rights section covering GDPR and CCPA', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Your Rights'),
      'Expected "Your Rights" section heading'
    )
    assert.ok(html.includes('GDPR'), 'Expected GDPR reference')
    assert.ok(html.includes('CCPA'), 'Expected CCPA reference')
  })

  it('renders the Cookies section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(html.includes('Cookies'), 'Expected "Cookies" section heading')
  })

  it('renders the Security section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(html.includes('Security'), 'Expected "Security" section heading')
  })

  it('renders the Changes to This Policy section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Changes to This Policy'),
      'Expected "Changes to This Policy" section heading'
    )
  })

  it('renders the Contact Us section', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('Contact Us'),
      'Expected "Contact Us" section heading'
    )
  })

  it('renders the last updated date', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(html.includes('Last updated:'), 'Expected last updated date')
  })

  it('references Paddle for billing', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(html.includes('Paddle'), 'Expected Paddle billing reference')
  })

  it('references recording data contents', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy))
    assert.ok(
      html.includes('DOM snapshot') || html.includes('recording'),
      'Expected recording data description'
    )
  })
})
