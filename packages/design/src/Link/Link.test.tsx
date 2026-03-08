import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { createRef } from 'react'
import { Link } from './Link'

afterEach(cleanup)

describe('Link', () => {
  describe('default rendering', () => {
    it('renders a semantic <a> element with text content', () => {
      render(<Link href="https://example.com">Example</Link>)

      const anchor = document.querySelector('a')
      expect(anchor).not.toBeNull()
      expect(anchor?.textContent).toBe('Example')
    })

    it('passes href to the anchor element', () => {
      render(<Link href="https://example.com">Click</Link>)

      const anchor = document.querySelector('a')
      expect(anchor?.getAttribute('href')).toBe('https://example.com')
    })
  })

  describe('rel auto-injection', () => {
    it('auto-adds rel="noopener noreferrer" when target is _blank', () => {
      render(
        <Link href="https://example.com" target="_blank">
          External
        </Link>
      )

      const anchor = document.querySelector('a')
      expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('does not add rel when target is not _blank', () => {
      render(
        <Link href="https://example.com" target="_self">
          Internal
        </Link>
      )

      const anchor = document.querySelector('a')
      expect(anchor?.getAttribute('rel')).toBeNull()
    })

    it('uses explicit rel prop instead of auto-injected value', () => {
      render(
        <Link href="https://example.com" target="_blank" rel="nofollow">
          Sponsored
        </Link>
      )

      const anchor = document.querySelector('a')
      expect(anchor?.getAttribute('rel')).toBe('nofollow')
    })
  })

  describe('disabled state', () => {
    it('strips href when disabled', () => {
      render(
        <Link href="https://example.com" disabled>
          Disabled
        </Link>
      )

      const anchor = document.querySelector('a')
      expect(anchor?.hasAttribute('href')).toBe(false)
    })

    it('sets aria-disabled="true" when disabled', () => {
      render(
        <Link href="https://example.com" disabled>
          Disabled
        </Link>
      )

      const anchor = document.querySelector('a')
      expect(anchor?.getAttribute('aria-disabled')).toBe('true')
    })

    it('does not set aria-disabled when not disabled', () => {
      render(<Link href="https://example.com">Enabled</Link>)

      const anchor = document.querySelector('a')
      expect(anchor?.hasAttribute('aria-disabled')).toBe(false)
    })
  })

  describe('polymorphic rendering', () => {
    it('renders with a custom component', () => {
      render(
        <Link component="button" props={{ type: 'button' }}>
          Button Link
        </Link>
      )

      const button = document.querySelector('button')
      expect(button).not.toBeNull()
      expect(button?.textContent).toBe('Button Link')
    })

    it('forwards props to the custom component', () => {
      render(
        <Link
          component="button"
          props={{ type: 'submit', 'data-testid': 'custom-link' }}
        >
          Submit
        </Link>
      )

      const button = document.querySelector('button')
      expect(button?.getAttribute('type')).toBe('submit')
      expect(button?.getAttribute('data-testid')).toBe('custom-link')
    })
  })

  describe('ref forwarding', () => {
    it('forwards ref to the underlying element', () => {
      const ref = createRef<HTMLAnchorElement>()
      render(
        <Link ref={ref} href="https://example.com">
          Ref Link
        </Link>
      )

      expect(ref.current).not.toBeNull()
      expect(ref.current?.tagName).toBe('A')
    })
  })

})
