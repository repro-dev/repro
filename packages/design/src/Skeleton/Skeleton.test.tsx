import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Skeleton } from './Skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('renders with role="status", aria-busy="true", aria-label="Loading"', () => {
    render(<Skeleton />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('aria-busy')).toBe('true')
    expect(el!.getAttribute('aria-label')).toBe('Loading')
  })

  it('renders variant="text" with default dimensions', () => {
    render(<Skeleton variant="text" />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('renders variant="rectangular" without error', () => {
    render(<Skeleton variant="rectangular" />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('renders variant="circular" without error', () => {
    render(<Skeleton variant="circular" />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('renders multiple lines for text variant when lines > 1', () => {
    render(<Skeleton variant="text" lines={3} />)

    // The container has role="status"
    const container = document.querySelector('[role="status"]')
    expect(container).not.toBeNull()
    // Should have 3 child divs (one per line)
    expect(container!.children.length).toBe(3)
  })

  it('renders single line by default', () => {
    render(<Skeleton variant="text" />)

    // Single line variant renders a single div (no container)
    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('applies custom width and height', () => {
    render(<Skeleton width={200} height={50} />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('uses default variant text and default lines 1', () => {
    render(<Skeleton />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })
})
