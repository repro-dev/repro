import { ApiProvider } from '@repro/api-client'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FutureInstance, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

mock.module('@repro/design', {
  namedExports: {
    Alert: ({ children, type }: any) =>
      React.createElement(
        'div',
        { role: 'alert', 'data-type': type },
        children
      ),
    Block: ({ children }: any) => React.createElement('div', null, children),
    Button: ({ children, onClick, disabled, type }: any) =>
      React.createElement(
        'button',
        { onClick, disabled, type: type || 'button' },
        children
      ),
    Card: ({ children }: any) =>
      React.createElement('div', { className: 'card' }, children),
    Col: ({ children }: any) => React.createElement('div', null, children),
    Input: (props: any) => React.createElement('input', props),
    LoadingState: () =>
      React.createElement(
        'div',
        { 'data-testid': 'loading-state' },
        'Loading...'
      ),
    Modal: Object.assign(
      ({ children }: any) =>
        React.createElement('div', { 'data-testid': 'modal' }, children),
      {
        Body: ({ children }: any) =>
          React.createElement('div', { 'data-testid': 'modal-body' }, children),
        Header: ({ title, description }: any) =>
          React.createElement(
            'div',
            { 'data-testid': 'modal-header' },
            React.createElement('h2', null, title),
            description && React.createElement('p', null, description)
          ),
      }
    ),
    Row: ({ children }: any) => React.createElement('div', null, children),
    Text: ({ children, variant, as }: any) =>
      React.createElement(as || 'span', { 'data-variant': variant }, children),
    color: {
      primary: '#2563eb',
      text: { default: '#0f172a', muted: '#64748b', secondary: '#334155' },
      success: '#16a34a',
      danger: '#be123c',
      bg: { subtle: '#f8fafc' },
      border: { default: '#e2e8f0' },
    },
    fontFamily: { mono: 'monospace' },
    fontSize: { md: 14 },
    radius: { md: 8, none: 0, sm: 4, lg: 16, full: '9999px' },
    spacing: { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, '2xl': 24 },
  },
})

// Mock TotpSetupFlow to just render a button that calls onComplete
mock.module('./TotpSetupFlow', {
  namedExports: {
    TotpSetupFlow: ({ onComplete }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'totp-setup-flow' },
        React.createElement(
          'button',
          { onClick: onComplete, 'data-testid': 'complete-setup' },
          'Complete Setup'
        )
      ),
  },
})

const { ManageTotpSection } =
  require('./ManageTotpSection') as typeof import('./ManageTotpSection')

const disabledStatus = { enabled: false, backupCodesRemaining: 0 }
const enabledStatus = { enabled: true, backupCodesRemaining: 7 }
const regenCodes = { items: ['NEW1-CODE', 'NEW2-CODE', 'NEW3-CODE'] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
})

function renderSection(
  fetchImpl: (...args: Array<any>) => FutureInstance<Error, any>
) {
  const mockClient = {
    authStore: {
      getSessionToken: () => resolve(''),
      setSessionToken: () => resolve(''),
      clearSessionToken: () => resolve(undefined),
    },
    fetch: mock.fn(fetchImpl),
    debug: (method: any) => method.pipe((x: any) => x),
    wrapP: (method: any) => Promise.resolve(method),
  }

  render(
    React.createElement(
      ApiProvider,
      { client: mockClient },
      React.createElement(ManageTotpSection)
    )
  )

  return mockClient
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ManageTotpSection — disabled state', () => {
  it('shows "not enabled" status and set-up button', async () => {
    renderSection(() => resolve(disabledStatus))
    await new Promise(r => setTimeout(r, 30))

    assert.ok(screen.getByText('Two-factor authentication is not enabled.'))
    assert.ok(screen.getByText('Set up two-factor authentication'))
  })

  it('shows TotpSetupFlow when "Set up" is clicked', async () => {
    renderSection(() => resolve(disabledStatus))
    await new Promise(r => setTimeout(r, 30))

    fireEvent.click(screen.getByText('Set up two-factor authentication'))
    assert.ok(screen.getByTestId('totp-setup-flow'))
  })
})

describe('ManageTotpSection — enabled state', () => {
  it('shows enabled status and backup code count', async () => {
    renderSection(() => resolve(enabledStatus))
    await new Promise(r => setTimeout(r, 30))

    assert.ok(screen.getByText('Two-factor authentication is enabled.'))
    assert.ok(screen.getByText('7 backup codes remaining.'))
    assert.ok(screen.getByText('Regenerate backup codes'))
    assert.ok(screen.getByText('Disable two-factor authentication'))
  })

  it('shows singular "1 backup code" when count is 1', async () => {
    renderSection(() => resolve({ enabled: true, backupCodesRemaining: 1 }))
    await new Promise(r => setTimeout(r, 30))
    assert.ok(screen.getByText('1 backup code remaining.'))
  })

  it('shows disable form with password and code fields', async () => {
    renderSection(() => resolve(enabledStatus))
    await new Promise(r => setTimeout(r, 30))

    fireEvent.click(screen.getByText('Disable two-factor authentication'))
    assert.ok(screen.getByPlaceholderText('Password'))
    assert.ok(screen.getByPlaceholderText('Authentication code'))
  })

  it('sends disable request with password and code', async () => {
    let callIdx = 0
    const mockClient = renderSection(() => {
      callIdx++
      return callIdx === 1 ? resolve(enabledStatus) : resolve(null)
    })
    await new Promise(r => setTimeout(r, 30))

    // Open disable form and fill
    fireEvent.click(screen.getByText('Disable two-factor authentication'))
    await new Promise(r => setTimeout(r, 10))

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'mypassword' },
    })
    fireEvent.change(screen.getByPlaceholderText('Authentication code'), {
      target: { value: '123456' },
    })

    fireEvent.click(screen.getByText('Disable'))
    await new Promise(r => setTimeout(r, 30))

    const disableCalls = mockClient.fetch.mock.calls.filter(
      (c: any) => c.arguments && c.arguments[0] === '/account/totp/disable'
    )
    assert.equal(disableCalls.length, 1)
    assert.ok(disableCalls[0])
    const body = JSON.parse(
      (disableCalls[0].arguments[1] as any).body as string
    )
    assert.equal(body.password, 'mypassword')
    assert.equal(body.code, '123456')
  })

  it('shows error when disable fails', async () => {
    let callIdx = 0
    void renderSection(() => {
      callIdx++
      return callIdx === 1
        ? resolve(enabledStatus)
        : reject(new Error('Failed'))
    })
    await new Promise(r => setTimeout(r, 30))

    fireEvent.click(screen.getByText('Disable two-factor authentication'))
    await new Promise(r => setTimeout(r, 10))

    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'pwd' },
    })
    fireEvent.change(screen.getByPlaceholderText('Authentication code'), {
      target: { value: '123456' },
    })

    fireEvent.click(screen.getByText('Disable'))
    await new Promise(r => setTimeout(r, 50))

    const alerts = screen.getAllByRole('alert')
    assert.ok(alerts.some(a => a.textContent?.toLowerCase().includes('failed')))
  })
})

describe('ManageTotpSection — regenerate flow', () => {
  it('shows confirm dialog then regenerates codes', async () => {
    let callIdx = 0
    void renderSection(() => {
      callIdx++
      if (callIdx === 1) return resolve(enabledStatus)
      return resolve(regenCodes)
    })
    await new Promise(r => setTimeout(r, 30))

    // Click regenerate
    fireEvent.click(screen.getByText('Regenerate backup codes'))
    await new Promise(r => setTimeout(r, 10))

    // Confirm dialog should show with Yes/Cancel
    assert.ok(screen.getByText('Yes, regenerate'))

    // Click confirm
    fireEvent.click(screen.getByText('Yes, regenerate'))
    await new Promise(r => setTimeout(r, 30))

    // New codes should be displayed
    assert.ok(screen.getByText('NEW1-CODE'))
    assert.ok(screen.getByText('NEW2-CODE'))
    assert.ok(screen.getByText('NEW3-CODE'))
  })
})
