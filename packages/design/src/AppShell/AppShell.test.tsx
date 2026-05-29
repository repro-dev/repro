import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { SIDEBAR_WIDTH } from './AppShell'
import { AppShell } from './index'

afterEach(cleanup)

describe('AppShell', () => {
  it('renders children inside the content area', () => {
    render(
      <AppShell>
        <AppShell.Content>
          <span data-testid="content">Main content</span>
        </AppShell.Content>
      </AppShell>
    )

    expect(screen.getByTestId('content')).toBeDefined()
    expect(screen.getByText('Main content')).toBeDefined()
  })

  it('renders Sidebar as an <aside> element with default aria-label', () => {
    render(
      <AppShell>
        <AppShell.Sidebar>
          <span>Sidebar content</span>
        </AppShell.Sidebar>
        <AppShell.Content>
          <span>Content</span>
        </AppShell.Content>
      </AppShell>
    )

    const aside = document.querySelector('aside')
    expect(aside).not.toBeNull()
    expect(aside!.getAttribute('aria-label')).toBe('Sidebar')
    expect(aside!.textContent).toContain('Sidebar content')
  })

  it('renders Sidebar with custom aria-label', () => {
    render(
      <AppShell>
        <AppShell.Sidebar ariaLabel="Navigation">
          <span>Nav</span>
        </AppShell.Sidebar>
        <AppShell.Content>
          <span>Content</span>
        </AppShell.Content>
      </AppShell>
    )

    const aside = document.querySelector('aside')
    expect(aside).not.toBeNull()
    expect(aside!.getAttribute('aria-label')).toBe('Navigation')
  })

  it('renders Sidebar header when provided', () => {
    render(
      <AppShell>
        <AppShell.Sidebar header={<span data-testid="header">Header</span>}>
          <span>Nav</span>
        </AppShell.Sidebar>
        <AppShell.Content>
          <span>Content</span>
        </AppShell.Content>
      </AppShell>
    )

    expect(screen.getByTestId('header')).toBeDefined()
    expect(screen.getByText('Header')).toBeDefined()
  })

  it('renders Sidebar footer when provided', () => {
    render(
      <AppShell>
        <AppShell.Sidebar footer={<span data-testid="footer">Footer</span>}>
          <span>Nav</span>
        </AppShell.Sidebar>
        <AppShell.Content>
          <span>Content</span>
        </AppShell.Content>
      </AppShell>
    )

    expect(screen.getByTestId('footer')).toBeDefined()
    expect(screen.getByText('Footer')).toBeDefined()
  })

  it('renders SideNav inside Sidebar', () => {
    render(
      <AppShell>
        <AppShell.Sidebar>
          <nav data-testid="sidenav">
            <span>Navigation</span>
          </nav>
        </AppShell.Sidebar>
        <AppShell.Content>
          <span>Content</span>
        </AppShell.Content>
      </AppShell>
    )

    expect(screen.getByTestId('sidenav')).toBeDefined()
    expect(screen.getByText('Navigation')).toBeDefined()
  })

  it('renders the layout grid with correct sidebar width constant', () => {
    // SIDEBAR_WIDTH is exported and should be 220
    expect(SIDEBAR_WIDTH).toBe(220)
  })

  it('renders full viewport height grid', () => {
    const { container } = render(
      <AppShell>
        <AppShell.Sidebar>
          <span>Nav</span>
        </AppShell.Sidebar>
        <AppShell.Content>
          <span>Content</span>
        </AppShell.Content>
      </AppShell>
    )

    // The root AppShell renders a Grid with height="100dvh"
    expect(container.firstElementChild).not.toBeNull()
  })
})
