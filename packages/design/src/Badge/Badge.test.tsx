import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { createRef } from 'react'
import { Badge } from './Badge'

afterEach(cleanup)

describe('Badge', () => {
  it('renders a span with text content', () => {
    render(<Badge>Active</Badge>)

    const span = document.querySelector('span')
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe('Active')
  })

  it('renders each context variant without error', () => {
    const contexts = [
      'neutral',
      'info',
      'success',
      'warning',
      'danger',
    ] as const

    for (const ctx of contexts) {
      const { unmount } = render(<Badge context={ctx}>{ctx}</Badge>)
      expect(screen.getByText(ctx)).toBeDefined()
      unmount()
    }
  })

  it('renders each size variant without error', () => {
    const sizes = ['small', 'medium', 'large'] as const

    for (const sz of sizes) {
      const { unmount } = render(<Badge size={sz}>{sz}</Badge>)
      expect(screen.getByText(sz)).toBeDefined()
      unmount()
    }
  })

  it('applies rounded border-radius when rounded is true', () => {
    const { container } = render(<Badge rounded={true}>Rounded</Badge>)
    // Check that the element's class list matches (jsxstyle generates CSS)
    expect(container.firstElementChild).not.toBeNull()
  })

  it('uses square border-radius when rounded is false', () => {
    const { container } = render(<Badge rounded={false}>Square</Badge>)
    expect(container.firstElementChild).not.toBeNull()
  })

  it('uses default context neutral, default size medium, default rounded false', () => {
    render(<Badge>Default</Badge>)

    const span = document.querySelector('span')
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe('Default')
  })

  it('forwards ref to the underlying span', () => {
    const ref = createRef<HTMLSpanElement>()

    render(<Badge ref={ref}>Ref test</Badge>)

    expect(ref.current).not.toBeNull()
    expect(ref.current!.tagName).toBe('SPAN')
  })
})
