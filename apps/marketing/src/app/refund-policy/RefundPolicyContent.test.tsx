import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

// Mock @repro/design to avoid window-dependent jsxstyle initialisation
mock.module('@repro/design', {
  namedExports: {
    color: {
      text: { default: '#111', secondary: '#555', muted: '#999' },
    },
    spacing: {
      none: 0,
      xs: 2,
      sm: 4,
      md: 8,
      lg: 12,
      xl: 16,
      '2xl': 24,
      '3xl': 32,
    },
    textStyles: {
      heading1: {},
      heading2: {},
      body: {},
      caption: {},
    },
    radius: { sm: 4, md: 8 },
    transition: { default: 'all 0.2s ease' },
    Logo: () => null,
  },
})

// Mock @jsxstyle/react to return plain DOM elements so we can render without
// a browser environment.
mock.module('@jsxstyle/react', {
  namedExports: {
    Block: ({
      component: C = 'div',
      children,
      props: htmlProps,
      ...rest
    }: any) => {
      const { createElement } = require('react') as typeof import('react')
      const { class: _cls, ...safeRest } = rest
      const filteredProps = Object.fromEntries(
        Object.entries(safeRest).filter(([k]) => /^(id|style|data-)/.test(k))
      )
      return createElement(C, { ...htmlProps, ...filteredProps }, children)
    },
    Col: ({
      component: C = 'div',
      children,
      props: htmlProps,
      ...rest
    }: any) => {
      const { createElement } = require('react') as typeof import('react')
      const { class: _cls, ...safeRest } = rest
      const filteredProps = Object.fromEntries(
        Object.entries(safeRest).filter(([k]) => /^(id|style|data-)/.test(k))
      )
      return createElement(C, { ...htmlProps, ...filteredProps }, children)
    },
    Row: ({
      component: C = 'div',
      children,
      props: htmlProps,
      ...rest
    }: any) => {
      const { createElement } = require('react') as typeof import('react')
      const { class: _cls, ...safeRest } = rest
      const filteredProps = Object.fromEntries(
        Object.entries(safeRest).filter(([k]) => /^(id|style|data-)/.test(k))
      )
      return createElement(C, { ...htmlProps, ...filteredProps }, children)
    },
  },
})

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach } from 'node:test'

// Import after mock setup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: RefundPolicyContent } =
  require('./RefundPolicyContent') as typeof import('./RefundPolicyContent')

afterEach(() => cleanup())

describe('RefundPolicyContent', () => {
  it('renders the page title', () => {
    render(<RefundPolicyContent />)
    const heading = screen.getByRole('heading', { level: 1 })
    assert.ok(heading.textContent?.includes('Refund'))
  })

  it('renders Overview section', () => {
    render(<RefundPolicyContent />)
    assert.ok(screen.getByRole('heading', { name: /Overview/i }))
  })

  it('renders Free Trial section', () => {
    render(<RefundPolicyContent />)
    assert.ok(screen.getByRole('heading', { name: /Free Trial/i }))
  })

  it('renders Subscription Cancellation section', () => {
    render(<RefundPolicyContent />)
    assert.ok(
      screen.getByRole('heading', { name: /Subscription Cancellation/i })
    )
  })

  it('renders Refund Eligibility section', () => {
    render(<RefundPolicyContent />)
    assert.ok(screen.getByRole('heading', { name: /Refund Eligibility/i }))
  })

  it('renders How to Request a Refund section', () => {
    render(<RefundPolicyContent />)
    assert.ok(screen.getByRole('heading', { name: /How to Request a Refund/i }))
  })

  it('renders Non-Refundable Items section', () => {
    render(<RefundPolicyContent />)
    assert.ok(screen.getByRole('heading', { name: /Non-Refundable Items/i }))
  })

  it('renders Contact section', () => {
    render(<RefundPolicyContent />)
    assert.ok(screen.getByRole('heading', { name: /Contact/i }))
  })
})
