import { RecordingMode } from '@repro/domain'
import { cleanup, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { RecordingTile } from './RecordingTile'

const mockRecording = {
  id: 'rec-1',
  title: 'My Test Recording',
  url: 'https://example.com',
  description: '',
  mode: RecordingMode.Live,
  duration: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  browserName: 'Chrome',
  browserVersion: '120',
  operatingSystem: null,
  codecVersion: '1.0.0',
}

function renderTile(projectId: string) {
  return render(
    <MemoryRouter>
      <RecordingTile recording={mockRecording} projectId={projectId} />
    </MemoryRouter>
  )
}

describe('RecordingTile', () => {
  afterEach(cleanup)

  it('should render the recording title', () => {
    renderTile('proj-1')
    assert.ok(screen.getByText('My Test Recording'))
  })

  it('should render a link pointing to the project-scoped route', () => {
    renderTile('proj-1')
    const link = screen.getByRole('link')
    assert.equal(link.getAttribute('href'), '/projects/proj-1/recordings/rec-1')
  })
})
