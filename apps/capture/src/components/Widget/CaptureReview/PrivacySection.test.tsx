import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

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
    FormField: ({ children }: any) => <div>{children}</div>,
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
  })

  const defaultProps = {
    open: true,
    onOpenChange: mock.fn() as () => void,
    onOverridesChange: mock.fn() as () => void,
  }

  it('renders heading and subtitle when open', () => {
    render(<PrivacySection {...defaultProps} />)

    const headings = screen.getAllByText('Privacy Controls')
    assert.ok(headings.length >= 1, 'Heading should be visible')

    const subtitle = screen.getByText(/Apply masking and content suppression/)
    assert.ok(subtitle, 'Subtitle should be visible')
  })

  it('does not render when closed', () => {
    render(<PrivacySection {...defaultProps} open={false} />)

    assert.equal(
      screen.queryByText('Privacy Controls'),
      null,
      'Heading should not be visible when closed'
    )
  })

  it('form fields are always visible', () => {
    render(<PrivacySection {...defaultProps} />)

    assert.ok(
      screen.getByText('Masked selectors'),
      'Mask label should be visible'
    )
    assert.ok(
      screen.getByText('Ignored selectors'),
      'Exclude label should be visible'
    )
  })

  it('masked selector input accepts and displays tag entries', () => {
    render(<PrivacySection {...defaultProps} />)

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    assert.ok(
      screen.getByText('.my-class'),
      'Tag should appear after pressing Enter'
    )
  })

  it('ignored selector input accepts and displays tag entries', () => {
    render(<PrivacySection {...defaultProps} />)

    const ignoredInput = screen.getByPlaceholderText(
      /Exclude elements matching/
    )
    fireEvent.input(ignoredInput, { target: { value: '.ignore-me' } })
    fireEvent.keyDown(ignoredInput, { key: 'Enter', code: 'Enter' })

    assert.ok(
      screen.getByText('.ignore-me'),
      'Tag should appear after pressing Enter'
    )
  })

  it('"Reset to defaults" clears all per-recording overrides', () => {
    render(<PrivacySection {...defaultProps} />)

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    assert.ok(screen.getByText('.my-class'), 'Tag should exist')

    const resetButton = screen.getByText(/Reset to defaults/i)
    fireEvent.click(resetButton)

    assert.equal(
      screen.queryByText('.my-class'),
      null,
      'Tag should be removed after reset'
    )
  })

  it('Apply button calls onOverridesChange and closes popover', () => {
    const onOverridesChange = mock.fn()
    const onOpenChange = mock.fn()

    render(
      <PrivacySection
        open={true}
        onOpenChange={onOpenChange}
        onOverridesChange={onOverridesChange}
      />
    )

    const applyButton = screen.getByText('Apply')
    fireEvent.click(applyButton)

    assert.equal(onOverridesChange.mock.callCount(), 1)
    assert.equal(onOpenChange.mock.callCount(), 1)
    assert.equal(onOpenChange.mock.calls[0]?.arguments[0], false)
  })

  it('Apply calls onOverridesChange with selectors when configured', () => {
    const onOverridesChange = mock.fn()

    render(
      <PrivacySection
        open={true}
        onOpenChange={mock.fn() as () => void}
        onOverridesChange={onOverridesChange}
      />
    )

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.test' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    const applyButton = screen.getByText('Apply')
    fireEvent.click(applyButton)

    assert.equal(onOverridesChange.mock.callCount(), 1)
    assert.deepEqual(onOverridesChange.mock.calls[0]?.arguments[0], {
      maskedSelectors: ['.test'],
      ignoredSelectors: [],
    })
  })

  it('does not persist per-recording privacy state after remount', () => {
    const { unmount } = render(<PrivacySection {...defaultProps} />)

    const maskedInput = screen.getByPlaceholderText(/Mask content matching/)
    fireEvent.input(maskedInput, { target: { value: '.my-class' } })
    fireEvent.keyDown(maskedInput, { key: 'Enter', code: 'Enter' })

    assert.ok(screen.getByText('.my-class'), 'Tag should exist')

    unmount()

    render(<PrivacySection {...defaultProps} />)

    assert.equal(
      screen.queryByText('.my-class'),
      null,
      'Tag should not persist after remount'
    )
  })
})
