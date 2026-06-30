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

const MockPopoverTrigger = ({ children }: any) => <>{children}</>
const MockPopoverContent = ({ children }: any) => <>{children}</>
const MockPopoverArrow = () => null
const MockPopover = ({ children, open }: any) =>
  open ? <div data-testid="popover">{children}</div> : null
MockPopover.Trigger = MockPopoverTrigger
MockPopover.Content = MockPopoverContent
MockPopover.Arrow = MockPopoverArrow

mock.module('@repro/design', {
  namedExports: {
    Popover: MockPopover,
    Button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Input: React.forwardRef(
      (
        { value, onChange, onBlur, placeholder, onKeyDown, onClick }: any,
        ref: any
      ) => (
        <input
          ref={ref}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          onClick={onClick}
        />
      )
    ),
    Label: ({ children, ...props }: any) => (
      <label {...props}>{children}</label>
    ),
    Text: ({ children, variant, color, ...props }: any) => (
      <span data-variant={variant} data-color={color} {...props}>
        {children}
      </span>
    ),
    Toggle: ({ checked, onChange, label }: any) => (
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={e => onChange((e.target as HTMLInputElement).checked)}
        />
        {label}
      </label>
    ),
    color: {
      text: {
        default: '#111',
        secondary: '#666',
      },
      bg: {
        muted: '#f0f0f0',
        surface: '#fff',
        hover: '#f5f5f5',
      },
      border: {
        default: '#ddd',
      },
      infoTint: '#fff',
      infoFg: 'rgba(255,255,255,0.2)',
    },
    radius: { sm: '4px' },
    spacing: {
      none: '0px',
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
    },
  },
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrivacySection } =
  require('./PrivacySection') as typeof import('./PrivacySection')

describe('PrivacySection', () => {
  afterEach(() => {
    cleanup()
    mockFetch = () =>
      resolve({
        recordingPrivacyPreset: 'standard',
      })
  })

  const defaultProps = {
    open: true,
    onOpenChange: mock.fn() as () => void,
    onOverridesChange: mock.fn() as () => void,
  }

  it('renders popover with workspace preset label when open', async () => {
    render(<PrivacySection {...defaultProps} />)

    // Heading should be visible
    const heading = await screen.findByText('Recording privacy')
    assert.ok(heading, 'Popover heading should be visible')
  })

  it('fetches workspace privacy preset when opened and displays it', async () => {
    render(<PrivacySection {...defaultProps} />)

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

    render(<PrivacySection {...defaultProps} />)

    const fallback = await screen.findByText(/unavailable/i)
    assert.ok(fallback, 'Fallback text should appear on fetch failure')
  })

  it('handles 403 error gracefully (non-admin user)', async () => {
    mockFetch = () => reject(new Error('Forbidden')) as FutureInstance<any, any>

    render(<PrivacySection {...defaultProps} />)

    const fallback = await screen.findByText(/unavailable/i)
    assert.ok(fallback, 'Fallback text should appear on 403')
  })

  it('does not fetch when closed', () => {
    render(<PrivacySection {...defaultProps} open={false} />)

    // Popover content should not be rendered when closed
    assert.equal(
      screen.queryByText('Recording privacy'),
      null,
      'Popover heading should not be visible when closed'
    )
  })

  it('toggle expands/collapses the override controls', async () => {
    render(<PrivacySection {...defaultProps} />)
    await screen.findByText(/Workspace default:/i)

    const toggleLabel = screen.queryByText(/Customize for this recording/i)
    assert.ok(toggleLabel, 'Toggle label should be visible')

    // Override controls should not be visible initially
    assert.equal(
      screen.queryByText(/Mask content matching/i),
      null,
      'Mask label should not be visible initially'
    )

    // Click the toggle to enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Override controls should now be visible
    const maskLabel = screen.getByText(/Mask content matching/i)
    assert.ok(maskLabel, 'Mask label should appear after toggle on')
  })

  it('masked selector input accepts and displays tag entries', async () => {
    render(<PrivacySection {...defaultProps} />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Find the masked selector input and add a tag
    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // The tag should be displayed
    const tag = screen.getByText('.my-class')
    assert.ok(tag, 'Tag should appear after pressing Enter')
  })

  it('ignored selector input accepts and displays tag entries', async () => {
    render(<PrivacySection {...defaultProps} />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    // Find the ignored selector input
    const ignoredInput = screen.getByPlaceholderText(
      /Exclude elements matching/
    )
    assert.ok(ignoredInput, 'Ignored input should be visible')

    fireEvent.input(ignoredInput, { target: { value: '.ignore-me' } })
    fireEvent.keyDown(ignoredInput, { key: 'Enter', code: 'Enter' })

    const tag = screen.getByText('.ignore-me')
    assert.ok(tag, 'Tag should appear after pressing Enter')
  })

  it('"Reset to defaults" clears all per-recording overrides', async () => {
    render(<PrivacySection {...defaultProps} />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides and add a tag
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    assert.ok(screen.getByText('.my-class'), 'Tag should exist')

    // Click Reset to defaults
    const resetButton = screen.getByText(/Reset to defaults/i)
    assert.ok(resetButton, 'Reset button should be visible')
    fireEvent.click(resetButton)

    // Tag should be gone
    assert.equal(
      screen.queryByText('.my-class'),
      null,
      'Tag should be removed after reset'
    )
  })

  it('Apply button calls onOverridesChange and closes popover', async () => {
    const onOverridesChange = mock.fn()
    const onOpenChange = mock.fn()

    render(
      <PrivacySection
        open={true}
        onOpenChange={onOpenChange}
        onOverridesChange={onOverridesChange}
      />
    )
    await screen.findByText(/Workspace default:/i)

    // Click Apply (no overrides)
    const applyButton = screen.getByText('Apply')
    fireEvent.click(applyButton)

    assert.equal(onOverridesChange.mock.callCount(), 1)
    assert.equal(onOpenChange.mock.callCount(), 1)
    assert.equal(onOpenChange.mock.calls[0]?.arguments[0], false)
  })

  it('Apply calls onOverridesChange with selectors when configured', async () => {
    const onOverridesChange = mock.fn()

    render(
      <PrivacySection
        open={true}
        onOpenChange={mock.fn() as () => void}
        onOverridesChange={onOverridesChange}
      />
    )
    await screen.findByText(/Workspace default:/i)

    // Enable overrides and add a masked tag
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.test' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    // Click Apply
    const applyButton = screen.getByText('Apply')
    fireEvent.click(applyButton)

    assert.equal(onOverridesChange.mock.callCount(), 1)
    const callArgs = onOverridesChange.mock.calls[0]
    assert.deepEqual(callArgs?.arguments[0], {
      maskedSelectors: ['.test'],
      ignoredSelectors: [],
    })
  })

  it('does not persist per-recording privacy state after remount', async () => {
    const { unmount } = render(<PrivacySection {...defaultProps} />)
    await screen.findByText(/Workspace default:/i)

    // Enable overrides and add a tag
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    assert.ok(screen.getByText('.my-class'), 'Tag should exist')

    // Unmount (simulate close)
    unmount()

    // Remount with fresh state
    render(<PrivacySection {...defaultProps} />)
    await screen.findByText(/Workspace default:/i)

    // No tag should persist and toggle should be off
    assert.equal(
      screen.queryByText('.my-class'),
      null,
      'Tag should not persist after remount'
    )

    const toggleAfter = screen.getByRole('switch')
    assert.equal(
      (toggleAfter as HTMLInputElement).checked,
      false,
      'Toggle should be off after remount'
    )
  })
})
