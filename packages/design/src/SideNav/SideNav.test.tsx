import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { SideNav } from './SideNav'

afterEach(cleanup)

describe('SideNav', () => {
  it('renders a <nav> element with default aria-label', () => {
    render(
      <SideNav>
        <SideNav.Item label="Home" />
      </SideNav>
    )

    const nav = document.querySelector('nav')
    expect(nav).not.toBeNull()
    expect(nav!.getAttribute('aria-label')).toBe('Navigation')
  })

  it('renders navigation item labels', () => {
    render(
      <SideNav>
        <SideNav.Item label="Home" />
        <SideNav.Item label="Dashboard" />
        <SideNav.Item label="Settings" />
      </SideNav>
    )

    expect(screen.getByText('Home')).toBeDefined()
    expect(screen.getByText('Dashboard')).toBeDefined()
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('renders items as buttons by default', () => {
    render(
      <SideNav>
        <SideNav.Item label="Home" />
      </SideNav>
    )

    const button = document.querySelector('button')
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe('Home')
  })

  it('renders items as links when a custom component is provided', () => {
    const FakeLink = React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement>
    >((props, ref) => <a ref={ref} {...props} />)
    FakeLink.displayName = 'FakeLink'

    render(
      <SideNav>
        <SideNav.Item
          label="Dashboard"
          component={FakeLink}
          props={{ href: '/dashboard' }}
        />
      </SideNav>
    )

    const link = document.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.textContent).toBe('Dashboard')
    expect(link!.getAttribute('href')).toBe('/dashboard')
  })

  it('marks active item visually', () => {
    render(
      <SideNav>
        <SideNav.Item label="Home" />
        <SideNav.Item label="Dashboard" active />
      </SideNav>
    )

    const buttons = document.querySelectorAll('button')
    expect(buttons.length).toBe(2)
    // Both render, active prop doesn't change the tag or ARIA — it's visual only
    expect(buttons[0]!.textContent).toBe('Home')
    expect(buttons[1]!.textContent).toBe('Dashboard')
  })

  it('disables item with aria-disabled', () => {
    render(
      <SideNav>
        <SideNav.Item label="Home" disabled />
      </SideNav>
    )

    const button = document.querySelector('button')
    expect(button).not.toBeNull()
    expect(button!.getAttribute('aria-disabled')).toBe('true')
  })

  it('renders SideNav.Section with title and role="group"', () => {
    render(
      <SideNav>
        <SideNav.Section title="Main">
          <SideNav.Item label="Dashboard" />
        </SideNav.Section>
      </SideNav>
    )

    const group = document.querySelector('[role="group"]')
    expect(group).not.toBeNull()
    expect(screen.getByText('Main')).toBeDefined()
    expect(screen.getByText('Dashboard')).toBeDefined()
  })

  it('renders SideNav.Section without title and role group', () => {
    render(
      <SideNav>
        <SideNav.Section>
          <SideNav.Item label="Dashboard" />
        </SideNav.Section>
      </SideNav>
    )

    // Without title, no role="group" should be applied
    const group = document.querySelector('[role="group"]')
    expect(group).toBeNull()
    expect(screen.getByText('Dashboard')).toBeDefined()
  })

  it('accepts custom aria-label on the nav', () => {
    render(
      <SideNav aria-label="Main navigation">
        <SideNav.Item label="Home" />
      </SideNav>
    )

    const nav = document.querySelector('nav')
    expect(nav).not.toBeNull()
    expect(nav!.getAttribute('aria-label')).toBe('Main navigation')
  })

  it('renders item with icon component', () => {
    const TestIcon = () => <svg data-testid="icon" />

    render(
      <SideNav>
        <SideNav.Item label="Home" icon={TestIcon} />
      </SideNav>
    )

    expect(screen.getByTestId('icon')).toBeDefined()
    expect(screen.getByText('Home')).toBeDefined()
  })
})
