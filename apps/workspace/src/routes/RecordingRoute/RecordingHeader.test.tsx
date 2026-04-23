import { RecordingMode, type RecordingInfo } from '@repro/domain'
import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

mock.module('@repro/date-utils', {
  namedExports: {
    formatDate: () => 'Jan 1, 2026, 12:00 AM',
    formatTime: (value: number) =>
      value === 60000 ? '01:00' : `${value.toString()}ms`,
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecordingHeader } =
  require('./RecordingHeader') as typeof import('./RecordingHeader')

const recording: RecordingInfo = {
  id: 'rec-1',
  title: 'Session 1',
  url: 'https://example.com/page',
  description: '',
  mode: RecordingMode.Replay,
  duration: 60000,
  createdAt: '2026-01-01T00:00:00.000Z',
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: 'macOS',
  codecVersion: '1.0.0',
}

afterEach(() => {
  cleanup()
})

describe('RecordingHeader', () => {
  it('renders breadcrumb, title, and metadata', () => {
    render(
      <MemoryRouter>
        <RecordingHeader
          projectId="proj-1"
          projectName="Project Alpha"
          recording={recording}
        />
      </MemoryRouter>
    )

    assert.ok(screen.getByRole('link', { name: '← Sessions' }))
    assert.ok(screen.getByRole('link', { name: 'Project Alpha' }))
    assert.equal(
      screen.getByText('Session 1').getAttribute('aria-current'),
      'page'
    )
    assert.equal(screen.queryByRole('link', { name: 'Session 1' }), null)
    assert.equal(
      screen
        .getByRole('link', { name: 'https://example.com/page' })
        .getAttribute('href'),
      'https://example.com/page'
    )
    assert.ok(screen.getByText('Jan 1, 2026, 12:00 AM'))
    assert.ok(screen.getByText('01:00'))
    assert.ok(screen.getByText('Chrome 120'))
    assert.ok(screen.getByText('macOS'))
    assert.ok(screen.getByText('Replay'))
  })

  it('does not make unsafe recording URLs clickable', () => {
    render(
      <MemoryRouter>
        <RecordingHeader
          projectId="proj-1"
          projectName="Project Alpha"
          recording={{
            ...recording,
            url: 'javascript:alert(1)',
          }}
        />
      </MemoryRouter>
    )

    assert.equal(
      screen.queryByRole('link', { name: 'javascript:alert(1)' }),
      null
    )
    assert.ok(screen.getByText('javascript:alert(1)'))
  })

  it('omits unavailable system metadata', () => {
    render(
      <MemoryRouter>
        <RecordingHeader
          projectId="proj-1"
          projectName="Project Alpha"
          recording={{
            ...recording,
            browserName: null,
            browserVersion: null,
            operatingSystem: null,
            mode: RecordingMode.Snapshot,
          }}
        />
      </MemoryRouter>
    )

    assert.equal(screen.queryByText('Chrome 120'), null)
    assert.equal(screen.queryByText('macOS'), null)
    assert.ok(screen.getByText('Snapshot'))
  })
})
