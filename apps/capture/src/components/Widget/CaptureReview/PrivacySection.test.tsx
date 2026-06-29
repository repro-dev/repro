import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { reject, resolve, type FutureInstance } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

/**
 * Controlled mock fetch — tests can reassign this to control API behavior.
 */
let mockFetch: (
  path: string,
  options?: { method?: string; body?: string }
) => FutureInstance<any, any> = () =>
  resolve({
    recordingPrivacyPreset: 'standard',
  })

mock.module('@repro/api-client', {
  namedExports: {
    useApiClient: () => ({
      fetch: mockFetch,
    }),
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrivacySection } =
  require('./PrivacySection') as typeof import('./PrivacySection')

describe('PrivacySection', () => {
  afterEach(() => {
    cleanup()
    // Reset mock fetch to default success behavior
    mockFetch = () =>
      resolve({
        recordingPrivacyPreset: 'standard',
      })
  })

  it('renders collapsed by default with workspace preset label', async () => {
    render(<PrivacySection />)

    const heading = screen.getByText('Privacy')
    assert.ok(heading, 'Section heading should be visible')

    // The badge shows "Standard" and the description also contains "Standard"
    const presetLabels = await screen.findAllByText(/standard/i)
    assert.ok(
      presetLabels.length >= 1,
      'Workspace preset should be displayed at least once'
    )
  })

  it('fetches workspace privacy preset on mount and displays it', async () => {
    render(<PrivacySection />)

    // Wait for the workspace default text to appear
    const workspaceDefault = await screen.findByText(/Workspace default:/i)
    assert.ok(
      workspaceDefault,
      'Workspace default label should be displayed after fetch'
    )
  })

  it('handles API fetch failure gracefully', async () => {
    mockFetch = () =>
      reject(new Error('Network error')) as FutureInstance<any, any>

    render(<PrivacySection />)

    // Should show fallback text
    const fallback = await screen.findByText(/unavailable/i)
    assert.ok(fallback, 'Fallback text should appear on fetch failure')
  })

  it('handles 403 error gracefully (non-admin user)', async () => {
    mockFetch = () => reject(new Error('Forbidden')) as FutureInstance<any, any>

    render(<PrivacySection />)

    const fallback = await screen.findByText(/unavailable/i)
    assert.ok(fallback, 'Fallback text should appear on 403')
  })

  it('toggle expands/collapses the override controls', async () => {
    render(<PrivacySection />)

    // Wait for preset to load
    await screen.findByText(/Workspace default:/i)

    // The customize toggle should be visible
    const toggleLabel = screen.queryByText(/Customize for this recording/i)
    assert.ok(toggleLabel, 'Toggle label should be visible')

    // The override controls should not be visible initially
    const maskedInput = screen.queryByPlaceholderText(/Mask content matching/i)
    assert.equal(
      maskedInput,
      null,
      'Masked input should not be visible initially'
    )

    // Click the toggle to enable overrides
    const toggle = screen.getByRole('switch')
    assert.ok(toggle, 'Toggle should exist')
    fireEvent.click(toggle)

    // Override controls should now be visible
    const maskedInputAfter = await screen.findByPlaceholderText(
      /Mask content matching/i
    )
    assert.ok(maskedInputAfter, 'Masked input should appear after toggle on')
  })

  it('masked selector input accepts and displays tag entries', async () => {
    render(<PrivacySection />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Find the masked selector input and add a tag
    const maskedInput = await screen.findByPlaceholderText(
      /Mask content matching/i
    )
    assert.ok(maskedInput, 'Masked input should be visible')

    // Type a selector and press Enter
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // The tag should be displayed
    const tag = screen.getByText('.my-class')
    assert.ok(tag, 'Tag should appear after pressing Enter')
  })

  it('ignored selector input accepts and displays tag entries', async () => {
    render(<PrivacySection />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Find the ignored selector input
    const ignoredInput = await screen.findByPlaceholderText(
      /Exclude elements matching/i
    )
    assert.ok(ignoredInput, 'Ignored input should be visible')

    // Type a selector and press Enter
    fireEvent.input(ignoredInput, { target: { value: '.ignore-me' } })
    fireEvent.keyDown(ignoredInput, { key: 'Enter', code: 'Enter' })

    // The tag should be displayed
    const tag = screen.getByText('.ignore-me')
    assert.ok(tag, 'Tag should appear after pressing Enter')
  })

  it('"Reset to defaults" clears all per-recording overrides', async () => {
    render(<PrivacySection />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides and add a tag
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const maskedInput = await screen.findByPlaceholderText(
      /Mask content matching/i
    )
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // Tag should exist
    assert.ok(screen.getByText('.my-class'), 'Tag should exist')

    // Click Reset to defaults
    const resetButton = screen.getByText(/Reset to workspace defaults/i)
    assert.ok(resetButton, 'Reset button should be visible')
    fireEvent.click(resetButton)

    // Tag should be gone
    assert.equal(
      screen.queryByText('.my-class'),
      null,
      'Tag should be removed after reset'
    )
  })

  it('preview button highlights matching elements on click', async () => {
    render(<PrivacySection />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Preview button should be visible
    const previewButton = screen.getByText(/Preview/i)
    assert.ok(previewButton, 'Preview button should be visible')

    // Add a selector tag
    const maskedInput = await screen.findByPlaceholderText(
      /Mask content matching/i
    )
    fireEvent.input(maskedInput, { target: { value: '.highlight-me' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // Add a matching element to the DOM
    const el = document.createElement('div')
    el.className = 'highlight-me'
    document.body.appendChild(el)

    // Click the preview button
    fireEvent.click(previewButton)

    // Verify the matching element gets the outline style applied
    assert.equal(
      el.style.outline,
      '3px solid #f59e0b',
      'Element should have preview outline applied'
    )
    assert.equal(
      el.style.outlineOffset,
      '2px',
      'Element should have preview outline offset applied'
    )

    // Clean up
    document.body.removeChild(el)
  })

  it('calls onOverridesChange when masked selector is added', async () => {
    const onChange = mock.fn()

    render(<PrivacySection onOverridesChange={onChange} />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Add a masked selector tag
    const maskedInput = await screen.findByPlaceholderText(
      /Mask content matching/i
    )
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // Verify callback was called with the correct payload
    assert.equal(onChange.mock.callCount(), 1)
    const callArgs = onChange.mock.calls[0]
    assert.ok(callArgs, 'Callback should have been called')
    assert.deepEqual(callArgs.arguments[0], {
      maskedSelectors: ['.my-class'],
      ignoredSelectors: [],
    })
  })

  it('does not persist per-recording privacy state after unmount', async () => {
    const { unmount } = render(<PrivacySection />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides and add a tag
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const maskedInput = await screen.findByPlaceholderText(
      /Mask content matching/i
    )
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // Verify tag exists before unmount
    assert.ok(screen.getByText('.my-class'), 'Tag should exist before unmount')

    // Unmount (simulate modal close)
    unmount()

    // Remount
    render(<PrivacySection />)
    await screen.findByText(/Workspace default:/i)

    // Override controls should not be visible — toggle should be off
    assert.equal(
      screen.queryByPlaceholderText(/Mask content matching/i),
      null,
      'Masked input should not be visible after remount'
    )

    // Tag should not persist
    assert.equal(
      screen.queryByText('.my-class'),
      null,
      'Tag should not persist after remount'
    )
  })
})
