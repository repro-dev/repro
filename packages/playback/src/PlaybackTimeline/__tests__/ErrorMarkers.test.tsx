import {
  LogLevel,
  MessagePartType,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { findErrorAndWarningEvents } from '@repro/source-utils'
import { Box, List } from '@repro/tdl'
import { render } from '@testing-library/react'
import expect from 'expect'
import { describe, it, mock } from 'node:test'
import React from 'react'
import { ErrorMarkerFilterToggle } from '../ErrorMarkers'

describe('ErrorMarkerFilterToggle', () => {
  it('renders nothing when there are no events', () => {
    const { container } = render(
      <ErrorMarkerFilterToggle
        filter="all"
        onChange={() => {}}
        totalCount={0}
        errorCount={0}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders filter buttons when events exist', () => {
    const { container } = render(
      <ErrorMarkerFilterToggle
        filter="all"
        onChange={() => {}}
        totalCount={5}
        errorCount={3}
      />
    )
    expect(container.textContent).toContain('All (5)')
    expect(container.textContent).toContain('Errors (3)')
    expect(container.textContent).toContain('None')
  })

  it('renders filter state buttons with correct text', () => {
    const onChange = mock.fn()

    const { container } = render(
      <ErrorMarkerFilterToggle
        filter="all"
        onChange={onChange}
        totalCount={5}
        errorCount={3}
      />
    )

    // Verify the container shows the expected text
    expect(container.textContent).toContain('All (5)')
    expect(container.textContent).toContain('Errors (3)')
    expect(container.textContent).toContain('None')
  })
})

describe('findErrorAndWarningEvents (integration)', () => {
  it('scans events from a List of SourceEventView', () => {
    const events = new List(SourceEventView, [
      SourceEventView.from(
        new Box({
          type: SourceEventType.Console,
          time: 50,
          data: {
            level: LogLevel.Error,
            parts: [
              new Box({
                type: MessagePartType.String,
                value: 'Test error',
              }),
            ],
            stack: [],
          },
        })
      ),
    ])

    const entries = findErrorAndWarningEvents(events)
    expect(entries.length).toBe(1)
    expect(entries[0]?.severity).toBe('error')
    expect(entries[0]?.summary).toBe('Test error')
  })
})
