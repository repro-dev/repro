import { PortalRootProvider } from '@repro/design'
import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { SessionTableToolbar } from './SessionTableToolbar'

afterEach(cleanup)

function renderToolbar() {
  render(
    <PortalRootProvider>
      <SessionTableToolbar
        searchText=""
        selectedModes={[]}
        hiddenCount={0}
        onSearchChange={() => {}}
        onToggleMode={() => {}}
      />
    </PortalRootProvider>
  )
}

describe('SessionTableToolbar', () => {
  it('renders tooltips for each recording mode checkbox (Snapshot, Live, Replay)', () => {
    renderToolbar()

    const tooltips = document.querySelectorAll('[role="tooltip"]')
    assert.equal(tooltips.length, 3)
  })

  it('renders a tooltip explaining Snapshot mode', () => {
    renderToolbar()

    const tooltips = document.querySelectorAll('[role="tooltip"]')
    const snapshotTooltip = Array.from(tooltips).find(
      t => t.textContent?.includes('single-page capture')
    )
    assert.ok(snapshotTooltip)
  })

  it('renders a tooltip explaining Live mode', () => {
    renderToolbar()

    const tooltips = document.querySelectorAll('[role="tooltip"]')
    const liveTooltip = Array.from(tooltips).find(
      t => t.textContent?.includes('live recording')
    )
    assert.ok(liveTooltip)
  })

  it('renders a tooltip explaining Replay mode', () => {
    renderToolbar()

    const tooltips = document.querySelectorAll('[role="tooltip"]')
    const replayTooltip = Array.from(tooltips).find(
      t => t.textContent?.includes('replays captured')
    )
    assert.ok(replayTooltip)
  })
})
