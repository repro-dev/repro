import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { AvatarStackSummary } from './AvatarStackSummary'

afterEach(cleanup)

const members = [
  { id: 'ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'grace', email: 'grace@example.com', name: 'Grace Hopper' },
  {
    id: 'katherine',
    email: 'katherine@example.com',
    name: 'Katherine Johnson',
  },
  { id: 'mary', email: 'mary@example.com', name: 'Mary Jackson' },
  { id: 'dorothy', email: 'dorothy@example.com', name: 'Dorothy Vaughan' },
]

function getAvatarImages() {
  return Array.from(document.querySelectorAll('img'))
}

describe('AvatarStackSummary', () => {
  it('renders only maxVisible avatars with default overflow copy', () => {
    render(<AvatarStackSummary items={members} maxVisible={3} />)

    expect(getAvatarImages()).toHaveLength(3)
    expect(screen.getByText('and 2 more')).toBeDefined()
  })

  it('supports custom overflow copy', () => {
    render(
      <AvatarStackSummary
        items={members}
        maxVisible={2}
        overflowLabel={count => `+${count} teammates`}
      />
    )

    expect(screen.getByText('+3 teammates')).toBeDefined()
  })

  it('can expose a static grouped summary with an accessible label', () => {
    render(
      <AvatarStackSummary
        items={members.slice(0, 2)}
        label="2 users"
        ariaLabel="Assigned users"
      />
    )

    const group = screen.getByRole('group', { name: 'Assigned users' })
    expect(group).toBeDefined()
    expect(screen.getByText('2 users')).toBeDefined()
  })

  it('renders linked usage as one accessible link', () => {
    render(
      <AvatarStackSummary
        items={members}
        href="/settings/team"
        ariaLabel="View team members"
      />
    )

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/settings/team')
    expect(links[0]?.getAttribute('aria-label')).toBe('View team members')
  })

  it('does not render nested interactive descendants inside linked usage', () => {
    render(
      <AvatarStackSummary
        items={members}
        href="/settings/team"
        ariaLabel="View team members"
      />
    )

    const link = screen.getByRole('link', { name: 'View team members' })
    const nestedInteractive = link.querySelectorAll(
      'a, button, [role="link"], [role="button"]'
    )

    expect(nestedInteractive).toHaveLength(0)
  })

  it('renders configured empty copy', () => {
    render(<AvatarStackSummary items={[]} emptyLabel="No users assigned" />)

    expect(getAvatarImages()).toHaveLength(0)
    expect(screen.getByText('No users assigned')).toBeDefined()
  })
})
