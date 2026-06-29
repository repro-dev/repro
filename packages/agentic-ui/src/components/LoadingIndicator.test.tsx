import type { PendingAskUserInteraction } from '@repro/agentic'
import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { LoadingIndicator } from './LoadingIndicator'

function makePendingInteraction(): PendingAskUserInteraction {
  return {
    id: 'pi1',
    toolCallId: 'tc1',
    request: { prompt: 'What would you like to do?' },
    createdAt: new Date(),
  }
}

afterEach(() => {
  cleanup()
})

describe('LoadingIndicator', () => {
  it('shows "Waiting for your answer…" when pendingInteraction is non-null during tool-executing', () => {
    render(
      <LoadingIndicator
        loading="tool-executing"
        pendingInteraction={makePendingInteraction()}
      />
    )

    expect(screen.getByText('Waiting for your answer…')).toBeDefined()
  })

  it('shows "Analysing…" when tool-executing and no pendingInteraction', () => {
    render(
      <LoadingIndicator loading="tool-executing" pendingInteraction={null} />
    )

    expect(screen.getByText('Analysing…')).toBeDefined()
  })

  it('shows "Thinking…" when reasoning', () => {
    render(<LoadingIndicator loading="reasoning" />)

    expect(screen.getByText('Thinking…')).toBeDefined()
  })

  it('shows "Responding…" when responding', () => {
    render(<LoadingIndicator loading="responding" />)

    expect(screen.getByText('Responding…')).toBeDefined()
  })

  it('shows cancel button when onCancel is provided', () => {
    render(<LoadingIndicator loading="reasoning" onCancel={() => {}} />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
  })

  it('does not show cancel button when onCancel is not provided', () => {
    render(<LoadingIndicator loading="reasoning" />)

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})
